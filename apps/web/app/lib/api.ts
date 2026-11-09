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

export interface GymMembershipItem {
  gym_id: string;
  gym_name?: string;
  gym_slug?: string;
  role: string;
  is_active: boolean;
  isUnlocked?: boolean;
  hasCustomPassword?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    fullName: string;
    phone?: string;
    email?: string | null;
    isPlatformAdmin: boolean;
  };
  memberships: GymMembershipItem[];
  allMemberships?: GymMembershipItem[];
}

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || '/api/backend';
  }
  return process.env.API_URL || 'http://127.0.0.1:4000/api';
};

export async function loginUser(identifier: string, password: string): Promise<LoginResponse> {
  const url = `${getApiBaseUrl()}/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, phone: identifier, email: identifier, password })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Login failed: ${res.statusText}`);
  }

  return res.json();
}

export async function switchGymTenant(gymId: string, password?: string): Promise<{ success: boolean; gym: { id: string; name: string; slug: string; role: string } }> {
  const url = `${getApiBaseUrl()}/auth/switch-gym`;
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ gymId, password })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to switch gym: ${res.statusText}`);
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

export interface UpdateMemberInput {
  firstName?: string;
  lastName?: string | null;
  phone?: string;
  email?: string | null;
  gender?: string;
  dateOfBirth?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  status?: 'active' | 'inactive' | 'banned';
}

export async function updateMember(
  gymId: string,
  memberId: string,
  input: UpdateMemberInput,
  token?: string
): Promise<{ member: Member }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);

  if (!activeToken) {
    throw new Error('Authentication required');
  }

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members/${memberId}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${activeToken}`
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to update member: ${res.statusText}`);
  }

  return res.json();
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  country?: string;
  timezone?: string;
  currency?: string;
  taxRateBasisPoints?: number;
  adminPhone: string;
  adminFullName: string;
  adminPassword: string;
  adminEmail?: string;
}

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  default_country: string;
  timezone: string;
  currency: string;
  tax_rate_basis_points: number;
  created_at: string;
  admin_name: string | null;
  admin_phone: string | null;
  admin_email: string | null;
}

export async function fetchPlatformTenants(token?: string): Promise<{ tenants: TenantListItem[] }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);

  if (!activeToken) {
    throw new Error('Authentication required');
  }

  const url = `${getApiBaseUrl()}/gyms`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${activeToken}`
  };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch tenants: ${res.statusText}`);
  }

  return res.json();
}

export async function createTenantWithAdmin(
  input: CreateTenantInput,
  token?: string
): Promise<{
  gymId: string;
  name: string;
  slug: string;
  adminUser: { id: string; fullName: string; phone: string; email: string | null };
}> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);

  if (!activeToken) {
    throw new Error('Authentication required');
  }

  const url = `${getApiBaseUrl()}/gyms`;
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
    throw new Error(errorBody.error || `Failed to create tenant: ${res.statusText}`);
  }

  return res.json();
}

export interface MembershipPlan {
  id: string;
  gymId: string;
  name: string;
  durationDays: number;
  priceCents: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateMembershipPlanInput {
  name: string;
  durationDays: number;
  priceCents: number;
}

export interface UpdateMembershipPlanInput {
  name?: string;
  durationDays?: number;
  priceCents?: number;
  isActive?: boolean;
}

export interface SubscriptionItem {
  id: string;
  gymId: string;
  memberId: string;
  planId: string;
  status: 'pending' | 'active' | 'queued' | 'cancelled';
  startDate: string;
  endDate: string;
  totalPriceCents: number;
  discountCents: number;
  createdAt: string;
  planName?: string;
  planDurationDays?: number;
}

export interface CreateSubscriptionInput {
  planId: string;
  startDate?: string;
  discountCents?: number;
}

export async function fetchMembershipPlans(
  gymId: string,
  active?: boolean,
  token?: string
): Promise<{ plans: MembershipPlan[] }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  let url = `${getApiBaseUrl()}/gyms/${gymId}/plans`;
  if (active !== undefined) {
    url += `?active=${active}`;
  }

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch plans: ${res.statusText}`);
  }

  return res.json();
}

export async function createMembershipPlan(
  gymId: string,
  input: CreateMembershipPlanInput,
  token?: string
): Promise<{ plan: MembershipPlan }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/plans`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to create plan: ${res.statusText}`);
  }

  return res.json();
}

export async function updateMembershipPlan(
  gymId: string,
  planId: string,
  input: UpdateMembershipPlanInput,
  token?: string
): Promise<{ plan: MembershipPlan }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/plans/${planId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to update plan: ${res.statusText}`);
  }

  return res.json();
}

export async function deleteMembershipPlan(
  gymId: string,
  planId: string,
  token?: string
): Promise<{ success: boolean; message?: string; archived?: boolean }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/plans/${planId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to delete plan: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchMemberSubscriptions(
  gymId: string,
  memberId: string,
  token?: string
): Promise<{ subscriptions: SubscriptionItem[] }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members/${memberId}/subscriptions`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch member subscriptions: ${res.statusText}`);
  }

  return res.json();
}

export async function createSubscription(
  gymId: string,
  memberId: string,
  input: CreateSubscriptionInput,
  token?: string
): Promise<{ subscription: SubscriptionItem }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members/${memberId}/subscriptions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    },
    body: JSON.stringify(input)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to create subscription: ${res.statusText}`);
  }

  return res.json();
}

export async function cancelSubscription(
  gymId: string,
  subscriptionId: string,
  token?: string
): Promise<{ subscription: SubscriptionItem }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/subscriptions/${subscriptionId}/cancel`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    },
    body: JSON.stringify({ gymId })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to cancel subscription: ${res.statusText}`);
  }

  return res.json();
}

export interface PaymentItem {
  id: string;
  gymId: string;
  memberId: string;
  subscriptionId: string | null;
  receiptNumber: string;
  type: 'payment' | 'refund' | 'adjustment' | 'opening_balance' | 'reversal';
  method: 'cash' | 'upi' | 'card_pos' | 'bank_transfer';
  amountCents: number;
  taxCents: number;
  currency: string;
  effectiveDate: string;
  externalReference?: string | null;
  notes?: string | null;
  recordedByUserId: string;
  createdAt: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberNumber?: string;
  memberPhone?: string;
  memberEmail?: string;
}

export interface MemberFinancialSummary {
  member: {
    id: string;
    firstName: string;
    lastName: string | null;
    memberNumber: string;
  };
  summary: {
    totalPaidCents: number;
    totalRefundedCents: number;
    netPaidCents: number;
    totalBilledCents: number;
    balanceCents: number;
  };
  transactions: PaymentItem[];
}

export async function fetchPayments(
  gymId: string,
  options?: { memberId?: string; subscriptionId?: string; limit?: number; offset?: number },
  token?: string
): Promise<{ payments: PaymentItem[]; total: number; limit: number; offset: number }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const queryParams = new URLSearchParams();
  if (options?.memberId) queryParams.set('memberId', options.memberId);
  if (options?.subscriptionId) queryParams.set('subscriptionId', options.subscriptionId);
  if (options?.limit) queryParams.set('limit', String(options.limit));
  if (options?.offset) queryParams.set('offset', String(options.offset));

  const url = `${getApiBaseUrl()}/gyms/${gymId}/payments?${queryParams.toString()}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch payments: ${res.statusText}`);
  }

  return res.json();
}

export async function recordPayment(
  gymId: string,
  payload: {
    memberId: string;
    subscriptionId?: string | null;
    idempotencyKey?: string;
    amountCents: number;
    method: 'cash' | 'upi' | 'card_pos' | 'bank_transfer';
    externalReference?: string | null;
    notes?: string | null;
  },
  token?: string
): Promise<{ payment: PaymentItem; isReplay: boolean }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const idempotencyKey = payload.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}`);

  const url = `${getApiBaseUrl()}/gyms/${gymId}/payments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    },
    body: JSON.stringify({
      ...payload,
      idempotencyKey
    })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to record payment: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchPaymentReceipt(
  gymId: string,
  paymentId: string,
  token?: string
): Promise<{ payment: PaymentItem }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/payments/${paymentId}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch receipt: ${res.statusText}`);
  }

  return res.json();
}

export async function refundPayment(
  gymId: string,
  paymentId: string,
  payload: {
    idempotencyKey?: string;
    amountCents: number;
    cancelSubscription?: boolean;
    notes?: string | null;
  },
  token?: string
): Promise<{ refund: PaymentItem; isReplay: boolean }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const idempotencyKey = payload.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ref-${Date.now()}`);

  const url = `${getApiBaseUrl()}/gyms/${gymId}/payments/${paymentId}/refund`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    },
    body: JSON.stringify({
      ...payload,
      idempotencyKey
    })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to issue refund: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchMemberFinancials(
  gymId: string,
  memberId: string,
  token?: string
): Promise<MemberFinancialSummary> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members/${memberId}/financials`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch financials: ${res.statusText}`);
  }

  return res.json();
}

export interface AttendanceLogItem {
  id: string;
  gymId: string;
  memberId: string;
  attendanceDate: string;
  checkInTime: string;
  method: 'staff_manual' | 'qr_kiosk';
  recordedByUserId: string;
  wasOverride: boolean;
  overrideReason?: 'medical_clearance_pending' | 'payment_promised_today' | 'forgot_wallet' | 'guest_pass' | 'other_owner_approved' | null;
  isVoided: boolean;
  voidedAt?: string | null;
  voidedByUserId?: string | null;
  voidReason?: string | null;
  createdAt: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberNumber?: string;
  memberPhone?: string;
}

export interface MemberAttendanceSummary {
  member: {
    id: string;
    firstName: string;
    lastName: string | null;
    memberNumber: string;
  };
  summary: {
    totalCheckIns: number;
    checkInsThisMonth: number;
  };
  attendance: AttendanceLogItem[];
}

export async function fetchAttendance(
  gymId: string,
  options?: { date?: string; memberId?: string; limit?: number; offset?: number },
  token?: string
): Promise<{ attendance: AttendanceLogItem[]; total: number; limit: number; offset: number }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const queryParams = new URLSearchParams();
  if (options?.date) queryParams.set('date', options.date);
  if (options?.memberId) queryParams.set('memberId', options.memberId);
  if (options?.limit) queryParams.set('limit', String(options.limit));
  if (options?.offset) queryParams.set('offset', String(options.offset));

  const url = `${getApiBaseUrl()}/gyms/${gymId}/attendance?${queryParams.toString()}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch attendance logs: ${res.statusText}`);
  }

  return res.json();
}

export async function recordCheckIn(
  gymId: string,
  payload: {
    memberId: string;
    method?: 'staff_manual' | 'qr_kiosk';
    wasOverride?: boolean;
    overrideReason?: string | null;
  },
  token?: string
): Promise<{ attendance: AttendanceLogItem }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/attendance/check-in`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to record check-in: ${res.statusText}`);
  }

  return res.json();
}

export async function voidAttendance(
  gymId: string,
  attendanceId: string,
  payload: { voidReason: string },
  token?: string
): Promise<{ success: boolean; message: string }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/attendance/${attendanceId}/void`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to void attendance: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchMemberAttendance(
  gymId: string,
  memberId: string,
  token?: string
): Promise<MemberAttendanceSummary> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members/${memberId}/attendance`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch member attendance: ${res.statusText}`);
  }

  return res.json();
}

export interface MemberRegistrationRequest {
  id: string;
  gymId: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  gender: string;
  dateOfBirth: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  enrolledMemberId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicGymInfo {
  id: string;
  name: string;
  slug: string;
  defaultCountry: string;
  currency: string;
  timezone: string;
}

export async function fetchPublicGymInfo(gymSlugOrId: string): Promise<PublicGymInfo> {
  const url = `${getApiBaseUrl()}/public/gyms/${encodeURIComponent(gymSlugOrId)}/info`;
  const res = await fetch(url);

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch gym info: ${res.statusText}`);
  }

  return res.json();
}

export async function submitPublicRegistration(
  gymSlugOrId: string,
  payload: {
    firstName: string;
    lastName?: string | null;
    phone: string;
    email?: string | null;
    gender?: string;
    dateOfBirth?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    notes?: string | null;
  }
): Promise<{ success: boolean; requestId: string; gymName: string; message: string }> {
  const url = `${getApiBaseUrl()}/public/gyms/${encodeURIComponent(gymSlugOrId)}/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Registration failed: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchRegistrationRequests(
  gymId: string,
  status?: string,
  token?: string
): Promise<{ requests: MemberRegistrationRequest[]; count: number }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/registration-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${activeToken}` }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch registration requests: ${res.statusText}`);
  }

  return res.json();
}

export async function approveRegistrationRequest(
  gymId: string,
  requestId: string,
  token?: string
): Promise<{ success: boolean; memberId: string; member: Member; message: string }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/registration-requests/${requestId}/approve`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to approve registration: ${res.statusText}`);
  }

  return res.json();
}

export async function rejectRegistrationRequest(
  gymId: string,
  requestId: string,
  reason?: string,
  token?: string
): Promise<{ success: boolean; message: string }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/registration-requests/${requestId}/reject`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`
    },
    body: JSON.stringify({ reason })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to reject registration: ${res.statusText}`);
  }

  return res.json();
}

export interface CsvImportJob {
  id: string;
  gymId: string;
  fileName: string;
  fileSha256: string;
  totalRows: number;
  processedRows: number;
  errorCount: number;
  errorsJson: Array<{
    row: number;
    field: string;
    code: string;
    message: string;
  }>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdByUserId: string;
  createdAt: string;
  completedAt: string | null;
}

export interface CsvImportResponse {
  job: CsvImportJob;
  importedCount: number;
  errorCount: number;
  totalRows: number;
}

export async function importMembersCsv(
  gymId: string,
  file: File,
  token?: string
): Promise<CsvImportResponse> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const formData = new FormData();
  formData.append('file', file);

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members/import-csv`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${activeToken}`
    },
    body: formData
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to import CSV: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchImportJobs(
  gymId: string,
  token?: string
): Promise<{ jobs: CsvImportJob[] }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members/import-jobs`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch import jobs: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchImportJob(
  gymId: string,
  jobId: string,
  token?: string
): Promise<{ job: CsvImportJob }> {
  const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined);
  if (!activeToken) throw new Error('Authentication required');

  const url = `${getApiBaseUrl()}/gyms/${gymId}/members/import-jobs/${jobId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${activeToken}`
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch import job: ${res.statusText}`);
  }

  return res.json();
}
