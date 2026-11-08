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

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || '/api/backend';
  }
  return process.env.API_URL || 'http://127.0.0.1:4000/api';
};

export async function fetchMembers(
  gymId: string,
  params: { q?: string; status?: string; limit?: number; offset?: number } = {},
  token?: string
): Promise<MembersResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members${query.toString() ? '?' + query.toString() : ''}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

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
  const url = `${getApiBaseUrl()}/gyms/${gymId}/members`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

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
