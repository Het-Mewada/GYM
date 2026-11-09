'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type Member,
  type CreateMemberInput,
  type UpdateMemberInput,
  type MembershipPlan,
  type SubscriptionItem,
  fetchMembers,
  createMember,
  updateMember,
  fetchPlatformTenants,
  fetchMembershipPlans,
  fetchMemberSubscriptions,
  createSubscription,
  cancelSubscription,
  type MemberRegistrationRequest,
  fetchRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest
} from '../lib/api';
import { useToast } from '../components/Toast';
import { Navbar } from '../components/Navbar';
import { PhoneInput, parsePhone } from '../components/PhoneInput';
import { TenantQrModal } from '../components/TenantQrModal';
import { CsvImportModal } from '../components/CsvImportModal';

export default function MembersPage() {
  const router = useRouter();
  const toast = useToast();
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [gymId, setGymId] = useState<string>('');
  const [gymName, setGymName] = useState<string | null>(null);
  const [gymSlug, setGymSlug] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tab & Registration Requests State
  const [activeTab, setActiveTab] = useState<'directory' | 'requests'>('directory');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<MemberRegistrationRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectModalReq, setRejectModalReq] = useState<MemberRegistrationRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Add Member Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add Member Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('unspecified');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // Edit Member Modal State
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Edit Member Form Fields
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGender, setEditGender] = useState('unspecified');
  const [editDateOfBirth, setEditDateOfBirth] = useState('');
  const [editEmergencyContactName, setEditEmergencyContactName] = useState('');
  const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive' | 'banned'>('active');

  // Subscription Modal State
  const [subscriptionMember, setSubscriptionMember] = useState<Member | null>(null);
  const [memberSubscriptions, setMemberSubscriptions] = useState<SubscriptionItem[]>([]);
  const [availablePlans, setAvailablePlans] = useState<MembershipPlan[]>([]);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [subModalError, setSubModalError] = useState<string | null>(null);
  const [subModalSuccess, setSubModalSuccess] = useState<string | null>(null);
  const [isSubmittingSubscription, setIsSubmittingSubscription] = useState(false);

  // New Subscription Form State
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');

  // Check auth session and fetch initial members immediately on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        setIsLoading(false);
        setIsInitialLoadDone(true);
        router.replace('/');
        return;
      }

      const storedGymId = localStorage.getItem('gym_id');
      const storedGymName = localStorage.getItem('gym_name');
      const storedGymSlug = localStorage.getItem('gym_slug');

      setIsAuthenticated(true);
      if (storedGymId) setGymId(storedGymId);
      if (storedGymName) setGymName(storedGymName);
      if (storedGymSlug) setGymSlug(storedGymSlug);
      setIsCheckingAuth(false);

      if (storedGymId) {
        setIsLoading(true);
        fetchMembers(storedGymId, {}, token)
          .then((res) => {
            if (res && Array.isArray(res.members)) {
              setMembers(res.members);
            }
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : 'Failed to fetch members from server');
          })
          .finally(() => {
            setIsLoading(false);
            setIsInitialLoadDone(true);
          });

        fetchRegistrationRequests(storedGymId, 'pending', token)
          .then((res) => {
            if (res && Array.isArray(res.requests)) {
              setPendingRequests(res.requests);
            }
          })
          .catch(() => {});
      } else {
        setIsLoading(true);
        fetchPlatformTenants(token)
          .then((res) => {
            if (res && Array.isArray(res.tenants) && res.tenants.length > 0) {
              const defaultTenant = res.tenants[0];
              localStorage.setItem('gym_id', defaultTenant.id);
              localStorage.setItem('gym_name', defaultTenant.name);
              setGymId(defaultTenant.id);
              setGymName(defaultTenant.name);
              fetchMembers(defaultTenant.id, {}, token)
                .then((mRes) => {
                  if (mRes && Array.isArray(mRes.members)) {
                    setMembers(mRes.members);
                  }
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : 'Failed to fetch members from server');
                })
                .finally(() => {
                  setIsLoading(false);
                  setIsInitialLoadDone(true);
                });
            } else {
              setIsLoading(false);
              setIsInitialLoadDone(true);
            }
          })
          .catch(() => {
            setIsLoading(false);
            setIsInitialLoadDone(true);
          });
      }

      const handleGymChangeEvent = (e: Event) => {
        const customEvent = e as CustomEvent<{ gymId: string; gymName: string; gymSlug?: string }>;
        if (customEvent.detail?.gymId) {
          setGymId(customEvent.detail.gymId);
          setGymName(customEvent.detail.gymName);
          if (customEvent.detail.gymSlug) setGymSlug(customEvent.detail.gymSlug);
          setIsLoading(true);
          fetchMembers(customEvent.detail.gymId, {}, token)
            .then((res) => {
              if (res && Array.isArray(res.members)) {
                setMembers(res.members);
              }
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Failed to fetch members from server');
            })
            .finally(() => {
              setIsLoading(false);
            });

          fetchRegistrationRequests(customEvent.detail.gymId, 'pending', token)
            .then((res) => {
              if (res && Array.isArray(res.requests)) {
                setPendingRequests(res.requests);
              }
            })
            .catch(() => {});
        }
      };

      window.addEventListener('gym-changed', handleGymChangeEvent);
      return () => window.removeEventListener('gym-changed', handleGymChangeEvent);
    }
  }, [router]);

  // Fetch pending registration requests for this gym
  const loadPendingRequests = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('access_token');
    if (!token || !gymId) return;

    setIsLoadingRequests(true);
    try {
      const res = await fetchRegistrationRequests(gymId, 'pending', token);
      if (res && Array.isArray(res.requests)) {
        setPendingRequests(res.requests);
      }
    } catch (err: unknown) {
      console.warn('Failed to load registration requests:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  }, [gymId]);

  // Fetch members from live backend only when authenticated
  const loadMembers = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('access_token');

    if (!token || !gymId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchMembers(gymId, { q: searchQuery, status: statusFilter }, token);
      if (res && Array.isArray(res.members)) {
        setMembers(res.members);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch members from server');
    } finally {
      setIsLoading(false);
    }
  }, [gymId, searchQuery, statusFilter]);

  const performSwitchGym = (newGymId: string, newGymName: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gym_id', newGymId);
      localStorage.setItem('gym_name', newGymName);
      const storedSlug = localStorage.getItem('gym_slug') || '';
      setGymSlug(storedSlug);
    }
    setGymId(newGymId);
    setGymName(newGymName);
    setIsLoading(true);
    setError(null);
    fetchMembers(newGymId)
      .then((res) => {
        if (res && Array.isArray(res.members)) {
          setMembers(res.members);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to fetch members for switched gym');
      })
      .finally(() => {
        setIsLoading(false);
      });

    loadPendingRequests();
  };

  const handleApproveRequest = async (request: MemberRegistrationRequest) => {
    setApprovingId(request.id);
    try {
      const res = await approveRegistrationRequest(gymId, request.id);
      toast.success(
        `✓ ${request.firstName} approved! Enrolled with Member ID ${res.member?.memberNumber || res.memberId}`
      );
      setPendingRequests((prev) => prev.filter((r) => r.id !== request.id));
      loadMembers();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to approve registration request');
    } finally {
      setApprovingId(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalReq) return;
    setRejectingId(rejectModalReq.id);
    try {
      await rejectRegistrationRequest(gymId, rejectModalReq.id, rejectReason.trim() || undefined);
      toast.info(`Registration request for ${rejectModalReq.firstName} was rejected.`);
      setPendingRequests((prev) => prev.filter((r) => r.id !== rejectModalReq.id));
      setRejectModalReq(null);
      setRejectReason('');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to reject registration request');
    } finally {
      setRejectingId(null);
    }
  };

  // Handle debounced search/filter changes after initial load is done
  useEffect(() => {
    if (!isInitialLoadDone || !isAuthenticated || !gymId) return;

    const timer = setTimeout(() => {
      loadMembers();
    }, 150);
    return () => clearTimeout(timer);
  }, [isInitialLoadDone, isAuthenticated, gymId, searchQuery, statusFilter, loadMembers]);

  // Handle Form Submission
  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!firstName.trim()) {
      setFormError('First Name is required');
      return;
    }
    if (!phone.trim()) {
      setFormError('Phone number is required');
      return;
    }

    const parsedPhone = parsePhone(phone);
    if (!parsedPhone.digits || parsedPhone.digits.length !== 10) {
      setFormError('Phone number must be exactly 10 digits');
      return;
    }

    if (emergencyContactPhone.trim()) {
      const parsedEm = parsePhone(emergencyContactPhone);
      if (parsedEm.digits.length !== 10) {
        setFormError('Emergency contact phone must be exactly 10 digits');
        return;
      }
    }

    // Validate duplicate phone or email in this gym
    const duplicatePhone = members.find((m) => m.phone === phone.trim());
    if (duplicatePhone) {
      setFormError(`A member with phone number "${phone.trim()}" is already registered (${duplicatePhone.firstName} ${duplicatePhone.lastName || ''}).`);
      return;
    }

    if (email.trim()) {
      const duplicateEmail = members.find((m) => m.email && m.email.toLowerCase() === email.trim().toLowerCase());
      if (duplicateEmail) {
        setFormError(`A member with email "${email.trim()}" is already registered (${duplicateEmail.firstName} ${duplicateEmail.lastName || ''}).`);
        return;
      }
    }

    setIsSubmitting(true);
    const input: CreateMemberInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim() ? lastName.trim() : undefined,
      phone: phone.trim(),
      email: email.trim() ? email.trim() : undefined,
      gender,
      dateOfBirth: dateOfBirth || undefined,
      emergencyContactName: emergencyContactName.trim() ? emergencyContactName.trim() : undefined,
      emergencyContactPhone: emergencyContactPhone.trim() ? emergencyContactPhone.trim() : undefined
    };

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;

      if (token && gymId) {
        // Authenticated live mode: write to Postgres via Fastify
        const res = await createMember(gymId, input, token);
        if (res && res.member) {
          setMembers((prev) => [res.member, ...prev]);
        }
      } else {
        // Standalone / client preview mode: generate local member
        const newSeq = (members.length + 1).toString().padStart(5, '0');
        const localMember: Member = {
          id: `mem-${Date.now()}`,
          gymId: gymId || 'local-gym',
          memberNumber: `MEM-${newSeq}`,
          firstName: input.firstName,
          lastName: input.lastName || null,
          phone: input.phone,
          email: input.email || null,
          gender: input.gender || 'unspecified',
          dateOfBirth: input.dateOfBirth || null,
          emergencyContactName: input.emergencyContactName || null,
          emergencyContactPhone: input.emergencyContactPhone || null,
          status: 'active',
          joinedDate: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setMembers((prev) => {
          const updated = [localMember, ...prev];
          if (typeof window !== 'undefined') {
            localStorage.setItem('local_preview_members', JSON.stringify(updated));
          }
          return updated;
        });
      }

      // Reset form and close modal
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setGender('unspecified');
      setDateOfBirth('');
      setEmergencyContactName('');
      setEmergencyContactPhone('');
      setIsModalOpen(false);
      setSuccessMessage('Member enrolled successfully!');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create member');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage);
      setSuccessMessage(null);
    }
  }, [successMessage, toast]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null);
    }
  }, [error, toast]);

  useEffect(() => {
    if (subModalSuccess) {
      toast.success(subModalSuccess);
      setSubModalSuccess(null);
    }
  }, [subModalSuccess, toast]);

  useEffect(() => {
    if (subModalError) {
      toast.error(subModalError);
      setSubModalError(null);
    }
  }, [subModalError, toast]);

  const handleOpenEditModal = (member: Member) => {
    setEditingMember(member);
    setEditFirstName(member.firstName);
    setEditLastName(member.lastName || '');
    setEditPhone(member.phone);
    setEditEmail(member.email || '');
    setEditGender(member.gender || 'unspecified');
    setEditDateOfBirth(member.dateOfBirth ? member.dateOfBirth.split('T')[0] : '');
    setEditEmergencyContactName(member.emergencyContactName || '');
    setEditEmergencyContactPhone(member.emergencyContactPhone || '');
    setEditStatus((member.status as 'active' | 'inactive' | 'banned') || 'active');
    setEditFormError(null);
  };

  const handleCloseEditModal = () => {
    setEditingMember(null);
    setEditFormError(null);
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setEditFormError(null);

    if (!editFirstName.trim()) {
      setEditFormError('First Name is required');
      return;
    }
    if (!editPhone.trim()) {
      setEditFormError('Phone number is required');
      return;
    }

    const parsedEditPhone = parsePhone(editPhone);
    if (!parsedEditPhone.digits || parsedEditPhone.digits.length !== 10) {
      setEditFormError('Phone number must be exactly 10 digits');
      return;
    }

    if (editEmergencyContactPhone.trim()) {
      const parsedEm = parsePhone(editEmergencyContactPhone);
      if (parsedEm.digits.length !== 10) {
        setEditFormError('Emergency contact phone must be exactly 10 digits');
        return;
      }
    }

    // Client-side check for duplicate phone or email in this gym (excluding current member)
    const duplicatePhone = members.find((m) => m.id !== editingMember.id && m.phone === editPhone.trim());
    if (duplicatePhone) {
      setEditFormError('A member with this phone number already exists in this gym');
      return;
    }
    if (editEmail.trim()) {
      const duplicateEmail = members.find(
        (m) => m.id !== editingMember.id && m.email && m.email.toLowerCase() === editEmail.trim().toLowerCase()
      );
      if (duplicateEmail) {
        setEditFormError('A member with this email already exists in this gym');
        return;
      }
    }

    setIsEditSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const updatePayload: UpdateMemberInput = {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim() ? editLastName.trim() : null,
        phone: editPhone.trim(),
        email: editEmail.trim() ? editEmail.trim() : null,
        gender: editGender,
        dateOfBirth: editDateOfBirth || null,
        emergencyContactName: editEmergencyContactName.trim() ? editEmergencyContactName.trim() : null,
        emergencyContactPhone: editEmergencyContactPhone.trim() ? editEmergencyContactPhone.trim() : null,
        status: editStatus
      };

      if (isAuthenticated && gymId) {
        const res = await updateMember(gymId, editingMember.id, updatePayload, token);
        setMembers((prev) => prev.map((m) => (m.id === editingMember.id ? res.member : m)));
      } else {
        // Local preview mode
        setMembers((prev) =>
          prev.map((m) =>
            m.id === editingMember.id
              ? {
                  ...m,
                  firstName: updatePayload.firstName!,
                  lastName: updatePayload.lastName || null,
                  phone: updatePayload.phone!,
                  email: updatePayload.email || null,
                  gender: updatePayload.gender || 'unspecified',
                  dateOfBirth: updatePayload.dateOfBirth || null,
                  emergencyContactName: updatePayload.emergencyContactName || null,
                  emergencyContactPhone: updatePayload.emergencyContactPhone || null,
                  status: updatePayload.status || m.status,
                  updatedAt: new Date().toISOString()
                }
              : m
          )
        );
      }

      setSuccessMessage(`Member ${editingMember.memberNumber} updated successfully!`);
      setEditingMember(null);
    } catch (err: unknown) {
      setEditFormError(err instanceof Error ? err.message : 'Failed to update member');
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleOpenSubscriptionsModal = async (member: Member) => {
    setSubscriptionMember(member);
    setSubModalError(null);
    setSubModalSuccess(null);
    setSelectedPlanId('');
    setCustomStartDate('');
    setDiscountAmount('0');
    setIsLoadingSubscriptions(true);

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
    if (token && gymId) {
      try {
        const [plansRes, subsRes] = await Promise.all([
          fetchMembershipPlans(gymId, true, token),
          fetchMemberSubscriptions(gymId, member.id, token)
        ]);
        if (plansRes && Array.isArray(plansRes.plans)) {
          setAvailablePlans(plansRes.plans);
          if (plansRes.plans.length > 0) {
            setSelectedPlanId(plansRes.plans[0].id);
          }
        }
        if (subsRes && Array.isArray(subsRes.subscriptions)) {
          setMemberSubscriptions(subsRes.subscriptions);
        }
      } catch (err: unknown) {
        setSubModalError(err instanceof Error ? err.message : 'Failed to load member subscriptions');
      } finally {
        setIsLoadingSubscriptions(false);
      }
    } else {
      // Local preview simulation
      const samplePlans: MembershipPlan[] = [
        { id: 'plan-1', gymId: 'local-gym', name: 'Monthly Gold', durationDays: 30, priceCents: 300000, isActive: true, createdAt: new Date().toISOString() },
        { id: 'plan-2', gymId: 'local-gym', name: 'Quarterly Platinum', durationDays: 90, priceCents: 800000, isActive: true, createdAt: new Date().toISOString() }
      ];
      setAvailablePlans(samplePlans);
      setSelectedPlanId('plan-1');
      setIsLoadingSubscriptions(false);
    }
  };

  const handleCloseSubscriptionsModal = () => {
    setSubscriptionMember(null);
    setSubModalError(null);
    setSubModalSuccess(null);
  };

  const handleCreateSubscriptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscriptionMember) return;
    setSubModalError(null);

    if (!selectedPlanId) {
      setSubModalError('Please select a membership plan');
      return;
    }

    const discountCents = Math.round(parseFloat(discountAmount || '0') * 100);
    setIsSubmittingSubscription(true);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      if (token && gymId) {
        const res = await createSubscription(gymId, subscriptionMember.id, {
          planId: selectedPlanId,
          startDate: customStartDate || undefined,
          discountCents
        }, token);

        if (res && res.subscription) {
          const plan = availablePlans.find((p) => p.id === selectedPlanId);
          const fullSub: SubscriptionItem = {
            ...res.subscription,
            planName: plan?.name,
            planDurationDays: plan?.durationDays
          };
          setMemberSubscriptions((prev) => [fullSub, ...prev]);
          setSubModalSuccess('Subscription assigned successfully!');
        }
      } else {
        // Preview mode simulation
        const plan = availablePlans.find((p) => p.id === selectedPlanId);
        const duration = plan?.durationDays || 30;
        const start = customStartDate || new Date().toISOString().split('T')[0];
        const endD = new Date(start);
        endD.setUTCDate(endD.getUTCDate() + (duration - 1));

        const simSub: SubscriptionItem = {
          id: `sim-sub-${Date.now()}`,
          gymId: 'preview-mode',
          memberId: subscriptionMember.id,
          planId: selectedPlanId,
          status: start <= new Date().toISOString().split('T')[0] ? 'active' : 'queued',
          startDate: start,
          endDate: endD.toISOString().split('T')[0],
          totalPriceCents: plan?.priceCents || 300000,
          discountCents,
          createdAt: new Date().toISOString(),
          planName: plan?.name || 'Standard Plan',
          planDurationDays: duration
        };
        setMemberSubscriptions((prev) => [simSub, ...prev]);
        setSubModalSuccess('Subscription assigned in preview mode!');
      }

      setCustomStartDate('');
      setDiscountAmount('0');
    } catch (err: unknown) {
      setSubModalError(err instanceof Error ? err.message : 'Failed to create subscription');
    } finally {
      setIsSubmittingSubscription(false);
    }
  };

  const handleCancelSub = async (subId: string) => {
    if (!subscriptionMember) return;
    setSubModalError(null);

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
    if (token && gymId) {
      try {
        const res = await cancelSubscription(gymId, subId, token);
        if (res && res.subscription) {
          setMemberSubscriptions((prev) =>
            prev.map((s) => (s.id === subId ? { ...s, status: 'cancelled' } : s))
          );
          setSubModalSuccess('Subscription cancelled.');
        }
      } catch (err: unknown) {
        setSubModalError(err instanceof Error ? err.message : 'Failed to cancel subscription');
      }
    } else {
      setMemberSubscriptions((prev) =>
        prev.map((s) => (s.id === subId ? { ...s, status: 'cancelled' } : s))
      );
      setSubModalSuccess('Subscription cancelled.');
    }
  };

  // Filtered members list
  const displayedMembers = useMemo(() => {
    if (isAuthenticated) {
      // Backend handles search and status filtering via SQL
      return members;
    }
    // Client-side filtering when unauthenticated
    return members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const fullName = `${m.firstName} ${m.lastName || ''}`.toLowerCase();
      const phoneMatch = m.phone.toLowerCase().includes(q);
      const numMatch = m.memberNumber.toLowerCase().includes(q);
      const nameMatch = fullName.includes(q);
      return nameMatch || phoneMatch || numMatch;
    });
  }, [isAuthenticated, members, searchQuery, statusFilter]);

  const activeCount = useMemo(() => {
    return members.filter((m) => m.status === 'active').length;
  }, [members]);

  if (isCheckingAuth || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        <p className="text-xs text-neutral-400 font-medium">Checking authentication...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased flex flex-col">
      <Navbar
        activePage="members"
        currentGymId={gymId}
        currentGymName={gymName || undefined}
        onGymChange={performSwitchGym}
      />

      {/* Main Content Area */}
      <main className="w-full px-6 py-8 flex-1 space-y-6">

        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              Members Directory
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                {!isInitialLoadDone ? (
                  <span className="inline-flex items-center gap-1.5 text-neutral-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Loading...
                  </span>
                ) : (
                  `${members.length} Total`
                )}
              </span>
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Manage member profiles, view contact info, and issue new gym enrollments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="import-csv-button"
              onClick={() => setIsCsvModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 font-semibold text-sm transition shadow-sm cursor-pointer"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Import CSV
            </button>

            <button
              type="button"
              data-testid="qr-code-button"
              onClick={() => setIsQrModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 font-semibold text-sm transition shadow-sm cursor-pointer"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.008v.008H6.75V6.75zM6.75 16.5h.008v.008H6.75V16.5zM16.5 6.75h.008v.008H16.5V6.75zM13.5 13.5h.008v.008H13.5V13.5zM13.5 19.5h.008v.008H13.5V19.5zM19.5 13.5h.008v.008H19.5V13.5zM16.5 16.5h.008v.008H16.5V16.5zM19.5 19.5h.008v.008H19.5V19.5z" />
              </svg>
              Registration QR
            </button>

            <button
              type="button"
              data-testid="add-member-button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Member
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
          <button
            type="button"
            data-testid="tab-directory"
            onClick={() => setActiveTab('directory')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'directory'
                ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            Directory ({members.length})
          </button>
          <button
            type="button"
            data-testid="tab-pending-requests"
            onClick={() => {
              setActiveTab('requests');
              loadPendingRequests();
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'requests'
                ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            Pending Requests
            {pendingRequests.length > 0 && (
              <span
                data-testid="pending-requests-badge"
                className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30"
              >
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'directory' && (
          <>
            {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-neutral-800/80 bg-neutral-900/40 p-4 rounded-xl">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Total Members</div>
            <div className="text-2xl font-bold text-white mt-1">
              {!isInitialLoadDone ? <span className="text-neutral-600 animate-pulse">—</span> : members.length}
            </div>
          </div>
          <div className="border border-neutral-800/80 bg-neutral-900/40 p-4 rounded-xl">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Active Status</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {!isInitialLoadDone ? <span className="text-neutral-600 animate-pulse">—</span> : activeCount}
            </div>
          </div>
          <div className="border border-neutral-800/80 bg-neutral-900/40 p-4 rounded-xl">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Current Search Match</div>
            <div className="text-2xl font-bold text-neutral-200 mt-1">
              {!isInitialLoadDone ? <span className="text-neutral-600 animate-pulse">—</span> : displayedMembers.length}
            </div>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
          {/* Search Input */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <input
              type="text"
              data-testid="member-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone (+91...), or member # (MEM-...)"
              className="w-full pl-9 pr-9 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                data-testid="clear-search-button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <label htmlFor="status-filter" className="text-xs font-medium text-neutral-400 whitespace-nowrap">
              Filter:
            </label>
            <select
              id="status-filter"
              data-testid="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="py-2 px-3 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500 transition"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Members Table */}
        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
          <div className="overflow-x-auto">
            <table data-testid="members-table" className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/80 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  <th scope="col" className="px-6 py-3.5">Member #</th>
                  <th scope="col" className="px-6 py-3.5">Member Name</th>
                  <th scope="col" className="px-6 py-3.5">Phone Number</th>
                  <th scope="col" className="px-6 py-3.5">Email</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Joined Date</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {(isLoading || !isInitialLoadDone) ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center" data-testid="loading-state">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                        <p className="text-xs font-medium text-neutral-400">Loading members directory...</p>
                      </div>
                    </td>
                  </tr>
                ) : displayedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center" data-testid="empty-state">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                          </svg>
                        </div>
                        <div className="text-base font-semibold text-neutral-300">
                          No members found
                        </div>
                        <p className="text-xs text-neutral-500 max-w-sm">
                          {searchQuery
                            ? `No members matched your search for "${searchQuery}". Check the spelling or try searching by phone number.`
                            : 'No members have been enrolled yet. Click "+ Add Member" above to create your first member.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedMembers.map((member) => (
                    <tr
                      key={member.id}
                      data-testid={`member-row-${member.id}`}
                      className="hover:bg-neutral-900/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs font-medium text-emerald-400">
                        {member.memberNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-white">
                          {member.firstName} {member.lastName || ''}
                        </div>
                        {member.gender && member.gender !== 'unspecified' && (
                          <div className="text-xs text-neutral-500 capitalize">
                            {member.gender}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-neutral-300">
                        {member.phone}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-neutral-400 text-xs">
                        {member.email || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            member.status === 'active'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                              : member.status === 'banned'
                              ? 'bg-red-950/80 text-red-400 border border-red-800/80'
                              : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                          }`}
                        >
                          {member.status === 'active' ? '● Active' : member.status === 'banned' ? '✕ Banned' : '○ Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-neutral-400">
                        {member.joinedDate}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                        <button
                          type="button"
                          data-testid={`manage-subscriptions-${member.id}`}
                          onClick={() => handleOpenSubscriptionsModal(member)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 transition cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Subscriptions
                        </button>
                        <button
                          type="button"
                          data-testid={`edit-member-${member.id}`}
                          onClick={() => handleOpenEditModal(member)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}

        {/* Pending Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Pending Self-Registration Requests</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                    Owner / Manager Approval Required
                  </span>
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Walk-in visitors who scanned your gym&apos;s registration QR code appear here. Approve to issue official membership number and enroll them into your gym.
                </p>
              </div>
              <button
                type="button"
                onClick={loadPendingRequests}
                disabled={isLoadingRequests}
                className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium border border-neutral-800 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${isLoadingRequests ? 'animate-spin text-emerald-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isLoadingRequests ? 'Refreshing...' : 'Refresh Requests'}
              </button>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden shadow-xl">
              <table className="w-full text-left text-sm text-neutral-300">
                <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400 tracking-wider border-b border-neutral-800">
                  <tr>
                    <th className="px-6 py-3.5 font-medium">Applicant Name</th>
                    <th className="px-6 py-3.5 font-medium">Phone Number</th>
                    <th className="px-6 py-3.5 font-medium">Email</th>
                    <th className="px-6 py-3.5 font-medium">Details</th>
                    <th className="px-6 py-3.5 font-medium">Submitted</th>
                    <th className="px-6 py-3.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-normal">
                  {isLoadingRequests ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                          <p className="text-xs font-medium text-neutral-400">Loading pending requests...</p>
                        </div>
                      </td>
                    </tr>
                  ) : pendingRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center" data-testid="empty-requests-state">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500">
                            <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="text-base font-semibold text-neutral-300">
                            No Pending Registration Requests
                          </div>
                          <p className="text-xs text-neutral-500 max-w-md">
                            All registration requests have been processed. Click &quot;Registration QR&quot; above to display or print your gym&apos;s QR code for new walk-ins.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pendingRequests.map((req) => (
                      <tr key={req.id} data-testid={`request-row-${req.id}`} className="hover:bg-neutral-900/50 transition">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-white">{req.firstName} {req.lastName || ''}</div>
                          {req.gender && req.gender !== 'unspecified' && (
                            <span className="text-[11px] text-neutral-500 capitalize">{req.gender}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-neutral-200">
                          {req.phone}
                        </td>
                        <td className="px-6 py-4 text-xs text-neutral-400">
                          {req.email || '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-neutral-400 max-w-xs">
                          {req.dateOfBirth && <div>DOB: {req.dateOfBirth}</div>}
                          {req.notes && <div className="text-neutral-300 italic truncate">&quot;{req.notes}&quot;</div>}
                          {req.emergencyContactName && (
                            <div className="text-[11px] text-neutral-500">
                              Emergency: {req.emergencyContactName} ({req.emergencyContactPhone || 'No phone'})
                            </div>
                          )}
                          {!req.dateOfBirth && !req.notes && !req.emergencyContactName && '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-neutral-400 whitespace-nowrap">
                          {new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                          <button
                            type="button"
                            data-testid={`approve-request-${req.id}`}
                            disabled={approvingId === req.id || rejectingId === req.id}
                            onClick={() => handleApproveRequest(req)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black transition shadow-sm cursor-pointer disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            {approvingId === req.id ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            data-testid={`reject-request-${req.id}`}
                            disabled={approvingId === req.id || rejectingId === req.id}
                            onClick={() => {
                              setRejectModalReq(req);
                              setRejectReason('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Add Member Modal */}
      {isModalOpen && (
        <div
          data-testid="add-member-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Add New Member</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Single-name members are fully supported (Last Name is optional).
                </p>
              </div>
              <button
                type="button"
                data-testid="close-modal-button"
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form data-testid="add-member-form" onSubmit={handleCreateMember} className="p-6 space-y-4">
              {formError && (
                <div
                  data-testid="form-error"
                  className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="first-name-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    First Name <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    id="first-name-input"
                    type="text"
                    data-testid="first-name-input"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Suresh"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="last-name-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Last Name <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="last-name-input"
                    type="text"
                    data-testid="last-name-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Patel (or leave blank)"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="phone-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Phone Number <span className="text-emerald-400">*</span> <span className="text-neutral-500 font-normal">(Exact 10 digits)</span>
                  </label>
                  <PhoneInput
                    id="phone-input"
                    dataTestId="phone-input"
                    required
                    value={phone}
                    onChange={(full) => setPhone(full)}
                  />
                </div>

                <div>
                  <label htmlFor="email-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Email Address <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="email-input"
                    type="email"
                    data-testid="email-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="member@example.com"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gender-select" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Gender
                  </label>
                  <select
                    id="gender-select"
                    data-testid="gender-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="unspecified">Unspecified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="dob-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Date of Birth <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="dob-input"
                    type="date"
                    data-testid="dob-input"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-800/80">
                <div>
                  <label htmlFor="emergency-name-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Emergency Contact Name
                  </label>
                  <input
                    id="emergency-name-input"
                    type="text"
                    data-testid="emergency-contact-name-input"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    placeholder="Guardian or spouse"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="emergency-phone-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Emergency Contact Phone <span className="text-neutral-500 font-normal">(Optional, 10 digits)</span>
                  </label>
                  <PhoneInput
                    id="emergency-phone-input"
                    dataTestId="emergency-contact-phone-input"
                    value={emergencyContactPhone}
                    onChange={(full) => setEmergencyContactPhone(full)}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  data-testid="cancel-button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-member-button"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-black transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : 'Save Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <div
          data-testid="edit-member-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">Edit Member</h3>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
                    {editingMember.memberNumber}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Update profile information, contact channels, and status for this member.
                </p>
              </div>
              <button
                type="button"
                data-testid="close-edit-modal-button"
                onClick={handleCloseEditModal}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form data-testid="edit-member-form" onSubmit={handleUpdateMember} className="p-6 space-y-4">
              {editFormError && (
                <div
                  data-testid="edit-form-error"
                  className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium"
                >
                  {editFormError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-first-name-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    First Name <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    id="edit-first-name-input"
                    type="text"
                    data-testid="edit-first-name-input"
                    required
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    placeholder="e.g. Suresh"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="edit-last-name-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Last Name <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="edit-last-name-input"
                    type="text"
                    data-testid="edit-last-name-input"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    placeholder="e.g. Patel (or leave blank)"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-phone-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Phone Number <span className="text-emerald-400">*</span> <span className="text-neutral-500 font-normal">(Exact 10 digits)</span>
                  </label>
                  <PhoneInput
                    id="edit-phone-input"
                    dataTestId="edit-phone-input"
                    required
                    value={editPhone}
                    onChange={(full) => setEditPhone(full)}
                  />
                </div>

                <div>
                  <label htmlFor="edit-email-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Email Address <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="edit-email-input"
                    type="email"
                    data-testid="edit-email-input"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="member@example.com"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="edit-status-select" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Status <span className="text-emerald-400">*</span>
                  </label>
                  <select
                    id="edit-status-select"
                    data-testid="edit-status-select"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive' | 'banned')}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="banned">Banned</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-gender-select" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Gender
                  </label>
                  <select
                    id="edit-gender-select"
                    data-testid="edit-gender-select"
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="unspecified">Unspecified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-dob-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Date of Birth <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="edit-dob-input"
                    type="date"
                    data-testid="edit-dob-input"
                    value={editDateOfBirth}
                    onChange={(e) => setEditDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-800/80">
                <div>
                  <label htmlFor="edit-emergency-name-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Emergency Contact Name
                  </label>
                  <input
                    id="edit-emergency-name-input"
                    type="text"
                    data-testid="edit-emergency-contact-name-input"
                    value={editEmergencyContactName}
                    onChange={(e) => setEditEmergencyContactName(e.target.value)}
                    placeholder="Guardian or spouse"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="edit-emergency-phone-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Emergency Contact Phone <span className="text-neutral-500 font-normal">(Optional, 10 digits)</span>
                  </label>
                  <PhoneInput
                    id="edit-emergency-phone-input"
                    dataTestId="edit-emergency-contact-phone-input"
                    value={editEmergencyContactPhone}
                    onChange={(full) => setEditEmergencyContactPhone(full)}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  data-testid="cancel-edit-button"
                  onClick={handleCloseEditModal}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-edit-member-button"
                  disabled={isEditSubmitting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-black transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
                >
                  {isEditSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Manage Subscriptions Modal */}
      {subscriptionMember && (
        <div
          data-testid="subscriptions-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Subscriptions for {subscriptionMember.firstName} {subscriptionMember.lastName || ''}</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-800 text-emerald-400 border border-neutral-700">
                    {subscriptionMember.memberNumber}
                  </span>
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  View subscription history, schedule renewal plans, or cancel active memberships.
                </p>
              </div>
              <button
                type="button"
                data-testid="close-subscriptions-modal"
                onClick={handleCloseSubscriptionsModal}
                className="text-neutral-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Subscriptions History Section */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
                  Subscription History ({memberSubscriptions.length})
                </h4>

                {isLoadingSubscriptions ? (
                  <div className="py-6 text-center space-y-2">
                    <div className="w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto" />
                    <p className="text-xs text-neutral-500">Loading subscriptions...</p>
                  </div>
                ) : memberSubscriptions.length === 0 ? (
                  <div
                    data-testid="no-subscriptions-state"
                    className="p-4 rounded-xl border border-dashed border-neutral-800 text-center text-xs text-neutral-500"
                  >
                    No subscriptions have been assigned to this member yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {memberSubscriptions.map((sub) => {
                      const priceInr = ((sub.totalPriceCents - (sub.discountCents || 0)) / 100).toLocaleString('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        maximumFractionDigits: 0
                      });

                      const isCancelable = sub.status === 'active' || sub.status === 'queued';

                      return (
                        <div
                          key={sub.id}
                          data-testid={`subscription-item-${sub.id}`}
                          className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-950/60 flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white text-sm">
                                {sub.planName || 'Membership Plan'}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${
                                  sub.status === 'active'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                    : sub.status === 'queued'
                                    ? 'bg-blue-950 text-blue-400 border border-blue-800'
                                    : sub.status === 'cancelled'
                                    ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                                    : 'bg-amber-950 text-amber-400 border border-amber-800'
                                }`}
                              >
                                {sub.status}
                              </span>
                            </div>
                            <div className="text-xs text-neutral-400 mt-1 font-mono">
                              {sub.startDate} → {sub.endDate}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className="font-bold text-white text-sm">
                              {priceInr}
                            </span>
                            {isCancelable && (
                              <button
                                type="button"
                                data-testid={`cancel-subscription-${sub.id}`}
                                onClick={() => handleCancelSub(sub.id)}
                                className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-red-950 hover:text-red-300 hover:border-red-800 text-[11px] font-medium text-neutral-400 border border-neutral-700 transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Assign New Subscription Section */}
              <div className="pt-4 border-t border-neutral-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Assign New Subscription
                </h4>

                <form onSubmit={handleCreateSubscriptionSubmit} className="space-y-4">
                  {availablePlans.length === 0 ? (
                    <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-950 text-xs text-neutral-400">
                      No active plans available.{' '}
                      <Link href="/plans" className="text-emerald-400 hover:underline">
                        Create a plan first →
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-neutral-300 mb-1">
                            Select Plan <span className="text-emerald-400">*</span>
                          </label>
                          <select
                            data-testid="select-subscription-plan"
                            required
                            value={selectedPlanId}
                            onChange={(e) => setSelectedPlanId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white focus:outline-none focus:border-emerald-500 transition cursor-pointer"
                          >
                            {availablePlans.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.durationDays} days • ₹{(p.priceCents / 100).toLocaleString('en-IN')})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-neutral-300 mb-1">
                            Start Date <span className="text-neutral-500 font-normal">(Leave blank for automatic queue)</span>
                          </label>
                          <input
                            type="date"
                            data-testid="subscription-start-date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white focus:outline-none focus:border-emerald-500 transition font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-neutral-300 mb-1">
                            Discount (INR ₹) <span className="text-neutral-500 font-normal">(Optional)</span>
                          </label>
                          <input
                            type="number"
                            data-testid="subscription-discount-amount"
                            min={0}
                            step={1}
                            value={discountAmount}
                            onChange={(e) => setDiscountAmount(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white focus:outline-none focus:border-emerald-500 transition font-mono"
                          />
                        </div>

                        {/* Summary Box */}
                        {(() => {
                          const plan = availablePlans.find((p) => p.id === selectedPlanId);
                          if (!plan) return null;
                          const basePrice = plan.priceCents / 100;
                          const disc = parseFloat(discountAmount || '0') || 0;
                          const finalPrice = Math.max(0, basePrice - disc);

                          return (
                            <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 text-xs flex flex-col justify-center">
                              <div className="text-neutral-400">Total payable:</div>
                              <div className="text-lg font-extrabold text-emerald-400">
                                ₹{finalPrice.toLocaleString('en-IN')}
                                {disc > 0 && <span className="text-[11px] text-neutral-500 line-through ml-2">₹{basePrice.toLocaleString('en-IN')}</span>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="submit"
                          data-testid="submit-subscription-button"
                          disabled={isSubmittingSubscription}
                          className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition shadow-lg shadow-emerald-950/50 disabled:opacity-50 cursor-pointer"
                        >
                          {isSubmittingSubscription ? 'Assigning...' : 'Confirm & Assign Subscription'}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Reject Request Modal */}
      {rejectModalReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Reject Registration Request</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Are you sure you want to reject the self-registration request for <strong className="text-white">{rejectModalReq.firstName} {rejectModalReq.lastName || ''}</strong> ({rejectModalReq.phone})?
            </p>
            <form onSubmit={handleConfirmReject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Reason for rejection <span className="text-neutral-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={255}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Incomplete details, invalid contact, spam"
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-2 text-xs text-white placeholder-neutral-600 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalReq(null)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rejectingId === rejectModalReq.id}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                >
                  {rejectingId === rejectModalReq.id ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tenant QR Code Modal */}
      <TenantQrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        gymId={gymId}
        gymName={gymName || 'Gym'}
        gymSlug={gymSlug}
      />

      {/* CSV Member Importer Modal */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        gymId={gymId}
        onImportSuccess={loadMembers}
      />
    </div>
  );
}
