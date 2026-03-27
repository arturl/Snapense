@description('Environment name')
param envName string

param location string
param containerImage string
param entraClientId string
param acrLoginServer string
param acrName string
param tags object

// Log Analytics
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-snapense-${envName}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
  tags: tags
}

// Container App Environment
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-snapense-${envName}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
  tags: tags
}

// ACR reference for credentials
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

// Container App
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-snapense-${envName}'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
      }
      registries: [
        {
          server: acrLoginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'snapense'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'ENTRA_CLIENT_ID', value: entraClientId }
            { name: 'ENTRA_TENANT_ID', value: 'common' }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '8080' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
  tags: tags
}

output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
