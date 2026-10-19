import { Injectable, inject } from "@angular/core";
import { SessionStorageService, StorageKeys } from "./session-storage.service";

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly storageService = inject(SessionStorageService);

  private readonly TOKEN_KEY = StorageKeys.JWT_TOKEN;
  private readonly ROLES_KEY = StorageKeys.USER_ROLES;
  private readonly PRODUCT_ROLES_KEY = StorageKeys.PRODUCT_ROLES;
  private readonly USER_INFO_KEY = StorageKeys.USER_INFO;
  private readonly BLOCKED_KEY = StorageKeys.KAI_IS_BLOCKED;
  private readonly AGENTS_ACCESSIBLE_KEY = StorageKeys.IS_AGENTS_ACCESSIBLE;
  private readonly SALT = 'KAI_CLIENT_SECRET_SALT_2026';
  private userRoles: string[] = [];
  private productRoles: string[] = [];

  private generateSignature(data: string): string {
    let hash = 0;
    const str = data + this.SALT;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  setRoles(roles: string[]) {
    this.userRoles = roles || [];
    const rolesStr = JSON.stringify(this.userRoles);
    const signature = this.generateSignature(rolesStr);
    const payload = btoa(JSON.stringify({ roles: this.userRoles, sig: signature }));
    this.storageService.setItem(this.ROLES_KEY, payload);
  }

  getRoles(): string[] {
    if (this.userRoles && this.userRoles.length > 0) {
      return this.userRoles;
    }

    const payload = this.storageService.getItem(this.ROLES_KEY);
    if (!payload) return [];

    try {
      const decoded = JSON.parse(atob(payload));
      const calculatedSig = this.generateSignature(JSON.stringify(decoded.roles));

      if (decoded.sig === calculatedSig) {
        this.userRoles = decoded.roles;
        return this.userRoles;
      }
      
      console.warn('Security Alert: userRoles payload has been tampered with!');
      this.clearToken();
      return [];
    } catch (e) {
      this.clearToken();
      return [];
    }
  }

  setProductRoles(roles: string[]) {
    this.productRoles = roles || [];
    const rolesStr = JSON.stringify(this.productRoles);
    const signature = this.generateSignature(rolesStr);
    const payload = btoa(JSON.stringify({ product_roles: this.productRoles, sig: signature }));
    this.storageService.setItem(this.PRODUCT_ROLES_KEY, payload);

    const hasAccess = this.hasAgentAccess();
    this.storageService.setItem(this.AGENTS_ACCESSIBLE_KEY, hasAccess ? 'true' : 'false');
  }

  getProductRoles(): string[] {
    if (this.productRoles && this.productRoles.length > 0) {
      return this.productRoles;
    }

    const payload = this.storageService.getItem(this.PRODUCT_ROLES_KEY);
    if (!payload) return [];

    try {
      const decoded = JSON.parse(atob(payload));
      const calculatedSig = this.generateSignature(JSON.stringify(decoded.product_roles));

      if (decoded.sig === calculatedSig) {
        this.productRoles = decoded.product_roles;
        return this.productRoles;
      }

      console.warn('Security Alert: productRoles payload has been tampered with!');
      return [];
    } catch (e) {
      return [];
    }
  }

  isProductAdmin(): boolean {
    const productRoles = this.getProductRoles().map((r) => String(r).toLowerCase().trim());

    return (
      productRoles.includes('is_product_admin') ||
      productRoles.some((r) => r.includes('product_admin'))
    );
  }

  setUserInfo(userInfo: any) {
    if (!userInfo) {
      this.storageService.removeItem(this.USER_INFO_KEY);
      return;
    }
    const infoStr = JSON.stringify(userInfo);
    const signature = this.generateSignature(infoStr);
    const payload = btoa(JSON.stringify({ info: userInfo, sig: signature }));
    this.storageService.setItem(this.USER_INFO_KEY, payload);
  }

  getUserInfo(): any {
    const payload = this.storageService.getItem(this.USER_INFO_KEY);
    if (!payload) return null;

    try {
      const decoded = JSON.parse(atob(payload));
      const calculatedSig = this.generateSignature(JSON.stringify(decoded.info));

      if (decoded.sig === calculatedSig) {
        return decoded.info;
      }
      console.warn('Security Alert: userInfo payload has been tampered with!');
      this.clearToken();
      return null;
    } catch (e) {
      this.clearToken();
      return null;
    }
  }

  setBlocked(blocked: boolean) {
    const signature = this.generateSignature(blocked ? 'true' : 'false');
    const payload = btoa(JSON.stringify({ blocked, sig: signature }));
    this.storageService.setItem(this.BLOCKED_KEY, payload);
  }

  isBlocked(): boolean {
    const payload = this.storageService.getItem(this.BLOCKED_KEY);
    if (!payload) return false;

    try {
      const decoded = JSON.parse(atob(payload));
      const calculatedSig = this.generateSignature(decoded.blocked ? 'true' : 'false');

      if (decoded.sig === calculatedSig) {
        return !!decoded.blocked;
      }
      console.warn('Security Alert: isBlocked payload has been tampered with!');
      this.clearToken();
      return true; // Default to blocked on tamper
    } catch (e) {
      this.clearToken();
      return true;
    }
  }

  isAdmin(): boolean {
    return this.getRoles().includes('kai_chatbot_dev_admin');
  }

  isHrAdmin(): boolean {
    return this.getRoles().includes('kai_chatbot_dev_hr');
  }

  isUser(): boolean {
    return this.getRoles().includes('kai_chatbot_dev_user');
  }

  hasAgentAccess(): boolean {
    const roles = this.getProductRoles().map((r) => r.toLowerCase());
    if (roles.length > 0) {
      const hasAccess = roles.some(
        (r) =>
          r.includes('kplatform') ||
          r.includes('k_agent') ||
          r.includes('agent') ||
          r.includes('kai_kplatform') ||
          r.includes('platform') 
      );
      this.storageService.setItem(this.AGENTS_ACCESSIBLE_KEY, hasAccess ? 'true' : 'false');
      return hasAccess;
    }

    const stored = this.storageService.getItem(this.AGENTS_ACCESSIBLE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }

    return false;
  }

  setAgentAccess(accessible: boolean): void {
    this.storageService.setItem(this.AGENTS_ACCESSIBLE_KEY, accessible ? 'true' : 'false');
  }

  setToken(token: string) {
    this.storageService.setItem(this.TOKEN_KEY, token);
  }

  getToken(): string | null {
    return this.storageService.getItem(this.TOKEN_KEY);
  }

  clearToken() {
    this.storageService.removeItem(this.TOKEN_KEY);
    this.storageService.removeItem(this.ROLES_KEY);
    this.storageService.removeItem(this.PRODUCT_ROLES_KEY);
    this.storageService.removeItem(this.USER_INFO_KEY);
    this.storageService.removeItem(this.BLOCKED_KEY);
    this.storageService.removeItem(this.AGENTS_ACCESSIBLE_KEY);
    this.userRoles = [];
    this.productRoles = [];
  }
}
