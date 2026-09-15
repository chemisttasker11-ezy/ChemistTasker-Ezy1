import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';
import { getViewSharedShift, Shift } from '@chemisttasker/shared-core';
import AuthLayout from '../layouts/AuthLayout';
import { setCanonical, setJsonLd, setPageMeta, setSocialMeta, setRobotsMeta } from '../utils/seo';
import ShiftsBoard from './dashboard/sidebar/ShiftsBoard';

const formatClockTime = (value?: string | null) => {
  if (!value) return '';
  const [hourPart = '0', minutePart = '00'] = value.split(':');
  let hour = Number(hourPart);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const minutes = minutePart.padStart(2, '0');
  return `${hour}:${minutes} ${suffix}`;
};

const SharedShiftLandingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // FIX: Only destructure the 'user' property, as 'loading' is not available.
  const { user } = useAuth();

  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true); // This is for the local API call loading state
  const [error, setError] = useState('');
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  const token = searchParams.get('token');
  const referralCode = searchParams.get('referral_code');
  const referralEventId = searchParams.get('referral_event_id');
  const registerTo = (() => {
    if (!referralCode) return '/register';
    const params = new URLSearchParams({ referral_code: referralCode });
    if (referralEventId) {
      params.set('referral_event_id', referralEventId);
    }
    if (shift?.id) {
      params.set('referral_shift_id', String(shift.id));
    }
    return `/register?${params.toString()}`;
  })();

  const mapSharedShift = useCallback((raw: any): Shift => {
    const pharmacy = raw.pharmacy_detail || raw.pharmacyDetail || {};
    const slots = (raw.slots || []).map((slot: any) => ({
      ...slot,
      id: slot.id,
      date: slot.date ?? slot.slot_date ?? slot.slotDate,
      startTime: slot.start_time ?? slot.startTime ?? '',
      endTime: slot.end_time ?? slot.endTime ?? '',
      startHour: slot.start_hour ?? slot.startHour,
      rate: slot.rate,
    }));
    return {
      ...raw,
      roleLabel: raw.role_label ?? raw.roleLabel ?? raw.role_needed ?? raw.roleNeeded,
      roleNeeded: raw.role_needed ?? raw.roleNeeded,
      employmentType: raw.employment_type ?? raw.employmentType,
      rateType: raw.rate_type ?? raw.rateType,
      minHourlyRate: raw.min_hourly_rate ?? raw.minHourlyRate,
      maxHourlyRate: raw.max_hourly_rate ?? raw.maxHourlyRate,
      minAnnualSalary: raw.min_annual_salary ?? raw.minAnnualSalary,
      maxAnnualSalary: raw.max_annual_salary ?? raw.maxAnnualSalary,
      fixedRate: raw.fixed_rate ?? raw.fixedRate,
      superPercent: raw.super_percent ?? raw.superPercent,
      paymentPreference: raw.payment_preference ?? raw.paymentPreference,
      postAnonymously: raw.post_anonymously ?? raw.postAnonymously,
      slots,
      flexibleTiming: raw.flexible_timing ?? raw.flexibleTiming,
      singleUserOnly: raw.single_user_only ?? raw.singleUserOnly,
      workloadTags: raw.workload_tags ?? raw.workloadTags ?? [],
      mustHave: raw.must_have ?? raw.mustHave ?? [],
      niceToHave: raw.nice_to_have ?? raw.niceToHave ?? [],
      hasTravel: raw.has_travel ?? raw.hasTravel ?? false,
      hasAccommodation: raw.has_accommodation ?? raw.hasAccommodation ?? false,
      isUrgent: raw.is_urgent ?? raw.isUrgent ?? false,
      uiIsNegotiable: raw.ui_is_negotiable ?? raw.uiIsNegotiable,
      uiIsFlexibleTime: raw.ui_is_flexible_time ?? raw.uiIsFlexibleTime,
      uiAllowPartial: raw.ui_allow_partial ?? raw.uiAllowPartial,
      uiLocationCity: raw.ui_location_city ?? raw.uiLocationCity ?? pharmacy.suburb,
      uiLocationState: raw.ui_location_state ?? raw.uiLocationState ?? pharmacy.state,
      uiAddressLine: raw.ui_address_line ?? raw.uiAddressLine ?? [
        pharmacy.street_address ?? pharmacy.streetAddress,
        pharmacy.suburb,
        pharmacy.state,
        pharmacy.postcode,
      ].filter(Boolean).join(', '),
      uiDistanceKm: raw.ui_distance_km ?? raw.uiDistanceKm,
      uiIsUrgent: raw.ui_is_urgent ?? raw.uiIsUrgent ?? raw.is_urgent ?? raw.isUrgent,
      pharmacyDetail: {
        name: pharmacy.name,
        streetAddress: pharmacy.street_address ?? pharmacy.streetAddress,
        suburb: pharmacy.suburb,
        state: pharmacy.state,
        postcode: pharmacy.postcode,
      },
      createdAt: raw.created_at ?? raw.createdAt,
      isClosed: raw.is_closed ?? raw.isClosed,
      closedReason: raw.closed_reason ?? raw.closedReason,
    } as Shift;
  }, []);

  useEffect(() => {
    const defaultTitle = 'Shift Opportunity | ChemistTasker';
    const defaultDescription = 'View shift details and apply on ChemistTasker.';
    const origin = window.location.origin;
    const fallbackUrl = `${origin}/shifts/link`;
    const defaultImage = `${origin}/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png`;

    if (!shift) {
      setPageMeta(defaultTitle, defaultDescription);
      setCanonical(fallbackUrl);
      setSocialMeta({
        title: defaultTitle,
        description: defaultDescription,
        url: fallbackUrl,
        image: defaultImage,
        type: 'website',
      });
      setJsonLd('shared-shift');
      setRobotsMeta();
      return;
    }

    const role = shift.roleNeeded ?? shift.roleLabel ?? 'Shift';
    const location =
      shift.postAnonymously
        ? shift.pharmacyDetail?.suburb
        : shift.pharmacyDetail?.suburb ?? shift.pharmacyDetail?.state;
    const title = `${role} Shift${location ? ` in ${location}` : ''} | ChemistTasker`;
    const firstSlot = (shift.slots ?? [])[0];
    const slotDate = firstSlot?.date ? dayjs(firstSlot.date).format('MMM D, YYYY') : '';
    const slotTime = firstSlot
      ? `${formatClockTime(firstSlot.startTime)}-${formatClockTime(firstSlot.endTime)}`.trim()
      : '';

    const descriptionParts = [
      `${role} shift`,
      location ? `in ${location}` : '',
      slotDate ? `on ${slotDate}` : '',
      slotTime ? `(${slotTime})` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const rawDescription = shift.description ? `${descriptionParts}. ${shift.description}` : descriptionParts;
    const description = rawDescription.length > 280 ? `${rawDescription.slice(0, 277)}...` : rawDescription;

    const canonicalUrl = token ? `${origin}/shifts/link?token=${encodeURIComponent(token)}` : `${origin}/shifts/link`;
    const isClosed = Boolean((shift as any).isClosed ?? (shift as any).is_closed);
    if (isClosed) {
      setRobotsMeta('noindex,follow');
    } else {
      setRobotsMeta();
    }
    setPageMeta(title, description);
    setCanonical(canonicalUrl);
    setSocialMeta({
      title,
      description,
      url: canonicalUrl,
      image: defaultImage,
      type: 'website',
    });

    const orgName = shift.postAnonymously
      ? 'ChemistTasker'
      : shift.pharmacyDetail?.name ?? 'ChemistTasker';
    const locationAddress = shift.uiAddressLine ?? '';
    const slotDates = (shift.slots ?? [])
      .map((slot) => slot.date)
      .filter(Boolean)
      .map((value) => dayjs(value).toISOString());
    const validThrough = slotDates.length ? slotDates.sort().slice(-1)[0] : null;

    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: `${role} Shift${location ? ` in ${location}` : ''}`,
      description: description || defaultDescription,
      identifier: {
        '@type': 'PropertyValue',
        name: 'ChemistTasker',
        value: String(shift.id),
      },
      hiringOrganization: {
        '@type': 'Organization',
        name: orgName,
      },
    };

    if (locationAddress) {
      jsonLd.jobLocation = {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          streetAddress: shift.pharmacyDetail?.streetAddress,
          addressLocality: shift.pharmacyDetail?.suburb,
          addressRegion: shift.pharmacyDetail?.state,
          postalCode: shift.pharmacyDetail?.postcode,
          addressCountry: 'AU',
        },
      };
    }

    if (validThrough) {
      jsonLd.validThrough = validThrough;
    }

    setJsonLd('shared-shift', jsonLd);

    return () => {
      setJsonLd('shared-shift');
    };
  }, [shift]);

  useEffect(() => {
    // The effect will now re-run when the 'user' object changes (e.g., from null to a user object after login check)
    const fetchShift = async () => {
        try {
            // Avoid sending literal "null"/"undefined" tokens; only include the param when it is real.
            const params: Record<string, string> = {};
            if (token) params.token = token;
            const response: any = await getViewSharedShift(params);
            const fetchedShift = response?.data ?? response;
            const mappedShift = mapSharedShift(fetchedShift);
            setShift(mappedShift);

            // If user is logged in, redirect them to the internal dashboard page
            if (user && mappedShift) {
                const rolePath = user.role.toLowerCase().replace('_', '');
                navigate(`/dashboard/${rolePath}/shifts/${mappedShift.id}`, { replace: true });
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || "Could not load this shift.");
        } finally {
            // Only stop loading if the user is not logged in.
            // If they are logged in, the page will redirect away, so we don't need to change the loading state.
            if (!user) {
              setLoading(false);
            }
        }
    };

    if (!token) {
        setError("No shift specified. A link must contain a share token.");
        setLoading(false);
    } else {
        fetchShift();
    }

  // FIX: The dependency array is simplified to not include the non-existent 'authLoading'.
  }, [token, user, navigate]);


  // FIX: The skeleton loader condition is simplified.
  // It will show while the API call is loading OR if a user is logged in (to hide the page before redirect).
  const renderContent = () => {
    if (loading || user) {
      return (
        <ShiftsBoard
          title="Shift Details"
          shifts={shift ? [shift] : []}
          loading
          onApplyAll={() => setLoginDialogOpen(true)}
          onApplySlot={() => setLoginDialogOpen(true)}
          enableSaved={false}
          hideSaveToggle
          readOnlyActions
          disableLocalPersistence
          hideCounterOffer
          hideFiltersAndSort
          hideTabs
        />
      );
    }

    if (error) {
      return (
        <Card sx={{ borderRadius: 3, boxShadow: 6 }}>
          <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="h5" color="error" gutterBottom>
              {error}
            </Typography>
            <Button sx={{ mt: 2 }} variant="contained" component={RouterLink} to="/shifts/public-board">
              Explore Other Shifts
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (!shift) return null;

    const isClosed = Boolean((shift as any).isClosed ?? (shift as any).is_closed);
    const closedReason =
      (shift as any).closedReason ??
      (shift as any).closed_reason ??
      "This shift doesn't accept candidates anymore.";

    return (
      <>
        {isClosed && (
          <Card sx={{ borderRadius: 3, boxShadow: 6, border: '1px solid #f5c6cb', backgroundColor: '#fff5f6', mb: 3 }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h6" color="error" gutterBottom>
                {closedReason}
              </Typography>
            </CardContent>
          </Card>
        )}
        <ShiftsBoard
          title="Shift Details"
          shifts={shift ? [shift] : []}
          loading={loading}
          onApplyAll={() => setLoginDialogOpen(true)}
          onApplySlot={() => setLoginDialogOpen(true)}
          enableSaved={false}
          hideSaveToggle
          readOnlyActions
          disableLocalPersistence
          hideCounterOffer
          hideFiltersAndSort
          hideTabs
        rejectActionGuard={() => isClosed}
        actionDisabledGuard={() => isClosed}
        fallbackToAllShiftsWhenEmpty
        showAllSlots={isClosed}
        onRefresh={() => {
            if (!token) return;
            return getViewSharedShift({ token })
              .then((response: any) => {
                const fetchedShift = response?.data ?? response;
                setShift(mapSharedShift(fetchedShift));
              })
              .catch(() => setError("Could not load this shift."));
          }}
        />
      </>
    );
  };

  return (
    <AuthLayout title="Shift Opportunity" maxWidth="lg" noCard showTitle={false}>
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
        {renderContent()}
      </Container>
      <Dialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)}>
        <DialogTitle>Log in to apply</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            You need an account to apply or send a counter offer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoginDialogOpen(false)}>Cancel</Button>
          <Button component={RouterLink} to={registerTo} variant="outlined">
            Create account
          </Button>
          <Button component={RouterLink} to="/login" variant="contained">
            Log in
          </Button>
        </DialogActions>
      </Dialog>
    </AuthLayout>
  );
};

export default SharedShiftLandingPage;
