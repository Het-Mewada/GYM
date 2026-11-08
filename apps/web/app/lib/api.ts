export interface Member {
  id: string;
  gymId: string;
  memberNumber: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  gender: string;
  dateOfBirth: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  status: 'active' | 'inactive' | 'banned';
  joinedDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemberInput {
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface MembersResponse {
  members: Member[];
  total: number;
  limit?: number;
  offset?: number;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    fullName: string;
    isPlatformAdmin: boolean;
  };
  memberships: Array<{
    gym_id: string;
    role: string;
    is_active: boolean;
  }>;
}

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || '/api/backend';
  }
  return process.env.API_URL || 'http://127.0.0.1:4000/api';
};

export async function loginUser(phone: string, password: string): Promise<LoginResponse> {
  const url = `${getApiBaseUrl()}/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Login failed: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchMembers(
  gymId: string,
  params: { q?: string; status?: string; limit?: number; offset?: number } = {},
  token?: string
): Promise<MembersResponse> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);

  if (!activeToken) {
    throw new Error('Authentication required');
  }

  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members${query.toString() ? '?' + query.toString() : ''}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${activeToken}`
  };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch members: ${res.statusText}`);
  }

  return res.json();
}

export async function createMember(
  gymId: string,
  input: CreateMemberInput,
  token?: string
): Promise<{ member: Member }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);

  if (!activeToken) {
    throw new Error('Authentication required');
  }

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${activeToken}`
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to create member: ${res.statusText}`);
  }

  return res.json();
}
