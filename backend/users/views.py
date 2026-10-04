"""Users API: authentication, verification, passwords, account and organization memberships.

The implementation lives in its owner modules (otp, login_security, sessions, account_deletion, recaptcha, api_auth,
api_otp, api_passwords, api_account, api_organizations); this module re-exports the historical names for the URL
modules and existing importers."""
from django.contrib.auth import get_user_model
from core.task_queue import async_task  # noqa: F401  (historical patch target)
from users.otp import (  # noqa: F401
    OTP_MAX_FAILED_ATTEMPTS,
    OTP_LOCKOUT_MINUTES,
    _hash_otp,
    _otp_matches,
    _get_lockout_response,
    _register_email_otp_failure,
    _reset_email_otp_security_state,
    _register_mobile_otp_failure,
    _reset_mobile_otp_security_state,
    generate_otp,
    normalize_au_mobile,
    valid_otp_format,
    _clean_identity_value,
    _capture_mobile_identity,
    _resolve_mobile_otp_user,
)
from users.login_security import (  # noqa: F401
    _reset_login_lockout_state,
    _get_login_attempt_state,
    _login_failure_response,
    _login_invalid_credentials_response,
)
from users.sessions import (  # noqa: F401
    _is_web_client,
    _cookie_kwargs,
    _set_auth_cookies,
    _clear_auth_cookies,
    _build_authenticated_user_payload,
)
from users.account_deletion import (  # noqa: F401
    _delete_verification_docs_for_user,
    _revoke_user_sessions,
    _revoke_user_tokens,
    _anonymize_user,
)
from users.recaptcha import (  # noqa: F401
    verify_recaptcha,
)
from users.api_auth import (  # noqa: F401
    MobileAppConfigView,
    RegisterView,
    CustomLoginView,
    CustomTokenRefreshView,
    LogoutView,
    CurrentUserView,
    UserViewSet,
    WsTicketView,
)
from users.api_otp import (  # noqa: F401
    VerifyOTPView,
    ResendOTPView,
    RequestMobileOTPView,
    VerifyMobileOTPView,
    ResendMobileOTPView,
)
from users.api_passwords import (  # noqa: F401
    PasswordResetConfirmAPIView,
    PasswordResetRequestAPIView,
)
from users.api_account import (  # noqa: F401
    ContactMessageCreateView,
    DeleteAccountView,
)
from users.api_organizations import (  # noqa: F401
    _enforce_org_delegation,
    InviteOrgUserView,
    OrganizationMembershipViewSet,
    OrganizationRoleDefinitionView,
)

User = get_user_model()
