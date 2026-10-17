/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Safe LocalStorage Wrapper
 * Protects against SecurityError / QuotaExceededError crashes when running under
 * file:/// protocol, restrictive browser sandboxes, or disabled cookies.
 */

class SafeStorageWrapper {
  private memStore: Record<string, string> = {};

  public getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // SecurityError on file:/// fallback to memory store
    }
    return this.memStore[key] !== undefined ? this.memStore[key] : null;
  }

  public setItem(key: string, value: string): void {
    this.memStore[key] = value;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // Memory store used safely
    }
  }

  public removeItem(key: string): void {
    delete this.memStore[key];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Memory store used safely
    }
  }
}

export const safeStorage = new SafeStorageWrapper();
