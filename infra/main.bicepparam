using './main.bicep'

param envName = 'dev'
param containerImage = readEnvironmentVariable('CONTAINER_IMAGE', 'mcr.microsoft.com/hello-world')
param entraClientId = readEnvironmentVariable('ENTRA_CLIENT_ID', '')
