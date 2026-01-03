import { credentialStore } from './credential-store';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

export interface CloudflareCertificate {
  id: string;
  hosts: string[];
  status: string;
  expires_on: string;
  certificate_authority: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

export interface CloudflareApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: T;
}

export class CloudflareClient {
  /**
   * Get authentication headers
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const email = await credentialStore.getCredential('cloudflare', 'email');
    const apiKey = await credentialStore.getCredential('cloudflare', 'api_key');

    if (!email || !apiKey) {
      throw new Error('Cloudflare credentials not configured');
    }

    return {
      'X-Auth-Email': email,
      'X-Auth-Key': apiKey,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Make API request
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${CF_API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json() as CloudflareApiResponse<T>;

    if (!data.success) {
      const errorMsg = data.errors.map(e => e.message).join(', ');
      throw new Error(`Cloudflare API error: ${errorMsg}`);
    }

    return data.result;
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.request<{ id: string }>('GET', '/user');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List zones
   */
  async listZones(): Promise<CloudflareZone[]> {
    return this.request<CloudflareZone[]>('GET', '/zones');
  }

  /**
   * Get zone by ID
   */
  async getZone(zoneId: string): Promise<CloudflareZone> {
    return this.request<CloudflareZone>('GET', `/zones/${zoneId}`);
  }

  /**
   * Get SSL certificates for a zone
   */
  async getZoneCertificates(zoneId: string): Promise<CloudflareCertificate[]> {
    return this.request<CloudflareCertificate[]>('GET', `/zones/${zoneId}/ssl/certificate_packs`);
  }

  /**
   * Get Universal SSL settings
   */
  async getUniversalSSLSettings(zoneId: string): Promise<{ enabled: boolean }> {
    return this.request<{ enabled: boolean }>('GET', `/zones/${zoneId}/ssl/universal/settings`);
  }

  /**
   * Order advanced certificate
   */
  async orderAdvancedCertificate(
    zoneId: string,
    hosts: string[],
    validityDays: number = 90
  ): Promise<CloudflareCertificate> {
    return this.request<CloudflareCertificate>('POST', `/zones/${zoneId}/ssl/certificate_packs/order`, {
      type: 'advanced',
      hosts,
      validation_method: 'txt',
      validity_days: validityDays,
      certificate_authority: 'lets_encrypt'
    });
  }

  /**
   * Restart certificate validation
   */
  async restartValidation(zoneId: string, certPackId: string): Promise<CloudflareCertificate> {
    return this.request<CloudflareCertificate>(
      'PATCH',
      `/zones/${zoneId}/ssl/certificate_packs/${certPackId}`,
      { validation_method: 'txt' }
    );
  }

  /**
   * Delete certificate pack
   */
  async deleteCertificatePack(zoneId: string, certPackId: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      'DELETE',
      `/zones/${zoneId}/ssl/certificate_packs/${certPackId}`
    );
  }

  /**
   * Get origin certificates
   */
  async getOriginCertificates(zoneId: string): Promise<Array<{
    id: string;
    certificate: string;
    hostnames: string[];
    expires_on: string;
  }>> {
    return this.request('GET', `/zones/${zoneId}/origin_tls_client_auth`);
  }

  /**
   * Create origin certificate
   */
  async createOriginCertificate(
    hostnames: string[],
    requestedValidity: number = 5475 // 15 years max
  ): Promise<{
    id: string;
    certificate: string;
    private_key: string;
    expires_on: string;
  }> {
    return this.request('POST', '/certificates', {
      hostnames,
      requested_validity: requestedValidity,
      request_type: 'origin-rsa',
      csr: '' // Let Cloudflare generate
    });
  }

  /**
   * List DNS records
   */
  async listDnsRecords(zoneId: string, filters?: { type?: string; name?: string }): Promise<Array<{
    id: string;
    type: string;
    name: string;
    content: string;
    ttl: number;
  }>> {
    let endpoint = `/zones/${zoneId}/dns_records`;
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.name) params.append('name', filters.name);
    if (params.toString()) endpoint += `?${params.toString()}`;
    
    return this.request('GET', endpoint);
  }

  /**
   * Create DNS record
   */
  async createDnsRecord(zoneId: string, record: {
    type: string;
    name: string;
    content: string;
    ttl?: number;
    proxied?: boolean;
  }): Promise<{ id: string }> {
    return this.request('POST', `/zones/${zoneId}/dns_records`, {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl || 1, // 1 = auto
      proxied: record.proxied ?? false
    });
  }

  /**
   * Delete DNS record
   */
  async deleteDnsRecord(zoneId: string, recordId: string): Promise<{ id: string }> {
    return this.request('DELETE', `/zones/${zoneId}/dns_records/${recordId}`);
  }
}

// Singleton instance
export const cloudflareClient = new CloudflareClient();
