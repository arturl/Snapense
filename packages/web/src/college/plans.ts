import type { CollegePlan } from "@snapense/shared";

const STORAGE_KEY = "snapense.529.plans.v1";

export function loadPlans(): CollegePlan[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function savePlans(plans: CollegePlan[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}
