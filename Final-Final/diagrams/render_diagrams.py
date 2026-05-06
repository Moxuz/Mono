"""
render_diagrams.py
Writes all .puml source files and renders them to PNG via PlantUML online API.
Run from: Final-Final/diagrams/
"""
import sys, os, zlib, struct, urllib.request
sys.stdout.reconfigure(encoding='utf-8')

OUT = os.path.join(os.path.dirname(__file__), 'output')
os.makedirs(OUT, exist_ok=True)

# ── PlantUML URL encoding ─────────────────────────────────────────────────────
_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

def _enc6(b):
    return _ALPHABET[b & 0x3F]

def _encode64(data):
    res = []
    for i in range(0, len(data), 3):
        c = data[i:i+3]
        if len(c) == 3:
            res += [_enc6(c[0]>>2), _enc6(((c[0]&3)<<4)|(c[1]>>4)),
                    _enc6(((c[1]&15)<<2)|(c[2]>>6)), _enc6(c[2]&63)]
        elif len(c) == 2:
            res += [_enc6(c[0]>>2), _enc6(((c[0]&3)<<4)|(c[1]>>4)),
                    _enc6((c[1]&15)<<2)]
        else:
            res += [_enc6(c[0]>>2), _enc6((c[0]&3)<<4)]
    return ''.join(res)

def plantuml_encode(text):
    data = zlib.compress(text.encode('utf-8'), 9)[2:-4]   # strip zlib header+adler32
    return _encode64(data)

def render(name, puml_text):
    puml_path = os.path.join(os.path.dirname(__file__), f'{name}.puml')
    png_path  = os.path.join(OUT, f'{name}.png')
    with open(puml_path, 'w', encoding='utf-8') as f:
        f.write(puml_text)
    encoded = plantuml_encode(puml_text)
    url = f'https://www.plantuml.com/plantuml/png/{encoded}'
    print(f'Rendering {name} …', end=' ', flush=True)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            png = r.read()
        with open(png_path, 'wb') as f:
            f.write(png)
        print(f'OK  →  {png_path}')
    except Exception as e:
        print(f'FAILED: {e}\n  URL: {url}')

# ════════════════════════════════════════════════════════════════════════════════
# 1. USE CASE DIAGRAM
# ════════════════════════════════════════════════════════════════════════════════
USECASE = """
@startuml
!theme plain
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam actorStyle awesome
skinparam usecase {
  BackgroundColor #EEF5FF
  BorderColor     #2F6FAE
  FontSize        11
}
skinparam actor {
  BackgroundColor #FFFBCC
  BorderColor     #B8860B
}
skinparam ArrowColor #444444
skinparam rectangle {
  BackgroundColor #FAFAFA
  BorderColor     #2F6FAE
  BorderThickness 2
}

left to right direction

actor "User"                  as user
actor "Admin"                 as admin
actor "OAuth Client App"      as client
actor "Google OAuth"          as google
actor "GitHub OAuth"          as github
actor "Email Service"         as email

admin -|> user

rectangle "TAS Authentication Server" {

  package "Account Management" {
    usecase "Register Account"      as UC_REG
    usecase "Verify Email"          as UC_VER
    usecase "Login (Local)"         as UC_LOGIN
    usecase "Login via Google"      as UC_GOOGLE
    usecase "Login via GitHub"      as UC_GITHUB
    usecase "Logout"                as UC_LOGOUT
  }

  package "Password Management" {
    usecase "Forgot Password"       as UC_FORGOT
    usecase "Reset Password"        as UC_RESET
    usecase "Change Password"       as UC_CHANGE_PW
  }

  package "Profile & Settings" {
    usecase "View / Update Profile" as UC_PROFILE
    usecase "Update Preferences"    as UC_PREFS
    usecase "View Activity Log"     as UC_ACTIVITY
    usecase "Export Personal Data\\n(PDPA)" as UC_EXPORT
    usecase "Delete Account"        as UC_DELETE
  }

  package "Session Management" {
    usecase "View Active Sessions"  as UC_SESSIONS
    usecase "Revoke Session"        as UC_REVOKE
    usecase "Emergency Lockdown"    as UC_LOCKDOWN
  }

  package "OAuth Client Management" {
    usecase "Register OAuth Client" as UC_REG_CLIENT
    usecase "Manage OAuth Clients"  as UC_MANAGE_CLIENT
  }

  package "OAuth 2.0 Server" {
    usecase "Grant Authorization\\n(Consent)"   as UC_CONSENT
    usecase "Exchange Code for Token"           as UC_TOKEN
    usecase "Refresh Access Token"              as UC_REFRESH
    usecase "Introspect Token"                  as UC_INTROSPECT
    usecase "Get User Info"                     as UC_USERINFO
    usecase "Revoke Token"                      as UC_REVOKE_TOKEN
  }

  package "Admin Dashboard" {
    usecase "View All Users"        as UC_USERS
    usecase "View Analytics"        as UC_ANALYTICS
    usecase "View Security Logs"    as UC_LOGS
    usecase "Monitor System Health" as UC_MONITOR
    usecase "Export Audit Logs"     as UC_EXPORT_LOG
  }
}

' ── User associations ──
user --> UC_REG
user --> UC_LOGIN
user --> UC_GOOGLE
user --> UC_GITHUB
user --> UC_LOGOUT
user --> UC_FORGOT
user --> UC_CHANGE_PW
user --> UC_PROFILE
user --> UC_PREFS
user --> UC_ACTIVITY
user --> UC_EXPORT
user --> UC_DELETE
user --> UC_SESSIONS
user --> UC_REVOKE
user --> UC_LOCKDOWN
user --> UC_REG_CLIENT
user --> UC_MANAGE_CLIENT
user --> UC_CONSENT

' ── Admin additional ──
admin --> UC_USERS
admin --> UC_ANALYTICS
admin --> UC_LOGS
admin --> UC_MONITOR
admin --> UC_EXPORT_LOG

' ── OAuth Client App ──
client --> UC_CONSENT
client --> UC_TOKEN
client --> UC_REFRESH
client --> UC_INTROSPECT
client --> UC_USERINFO
client --> UC_REVOKE_TOKEN

' ── External providers ──
UC_GOOGLE ..> google : <<extend>>
UC_GITHUB ..> github : <<extend>>

' ── Include relationships ──
UC_RESET  ..> UC_FORGOT     : <<include>>
UC_GOOGLE ..> UC_LOGIN      : <<include>>
UC_GITHUB ..> UC_LOGIN      : <<include>>
UC_CONSENT ..> UC_LOGIN     : <<include>>
UC_DELETE ..> UC_PROFILE    : <<include>>

' ── Email async ──
UC_REG    ..> email : <<notify>>
UC_FORGOT ..> email : <<notify>>
UC_LOGIN  ..> email : <<notify>>

' ── Verify email ──
UC_REG ..> UC_VER : <<include>>

@enduml
""".strip()

# ════════════════════════════════════════════════════════════════════════════════
# 2. SEQUENCE DIAGRAM — LOCAL LOGIN
# ════════════════════════════════════════════════════════════════════════════════
SEQ_LOGIN = """
@startuml
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam sequenceMessageAlign center
skinparam SequenceBoxBackgroundColor #EEF5FF
skinparam SequenceBoxBorderColor    #2F6FAE
skinparam ParticipantBackgroundColor #FFFBCC
skinparam ParticipantBorderColor    #B8860B
skinparam ArrowColor #444444
skinparam SequenceLifeLineBorderColor #888888

title Local Login Sequence

actor       "User"           as user
participant "Browser/Client" as browser
participant "Auth Server"    as server #EEF5FF
participant "Rate Limiter"   as rate   #F0F0F0
participant "MongoDB"        as mongo  #E8F5E9
participant "Email Service"  as email  #FCE4EC

user -> browser : Enter email + password
activate browser

browser -> server ++ : POST /api/auth/login\\n{email, password, remember?}

server -> rate ++ : Check rate limit (email + IP)
rate --> server -- : result

opt Rate limit exceeded
  server --> browser : 429 {"error": "Too many attempts"}
  browser --> user : Show error: Too many attempts
end

server -> mongo ++ : findOne({ email })
mongo --> server -- : User document

opt User not found
  server -> mongo : insertOne(securityAudit: login_failed)
  server --> browser : 401 {"error": "Invalid credentials"}
  browser --> user : Show error: Invalid credentials
end

opt Account is inactive
  server -> mongo : insertOne(securityAudit: login_failed)
  server --> browser : 403 {"error": "Account inactive"}
  browser --> user : Show error: Account inactive
end

opt Account locked (lockUntil > now)
  server -> mongo : insertOne(securityAudit: login_failed)
  server --> browser : 423 {"error": "Account locked (N min)"}
  browser --> user : Show error: Account locked
end

server -> server : bcrypt.compare(password, hash)

opt Password mismatch
  server -> mongo : Increment failedLoginAttempts\\n(lock if attempts >= 5)
  server -> mongo : insertOne(securityAudit: login_failed)
  server --> browser : 401 {"error": "Invalid credentials"}
  browser --> user : Show error: Invalid credentials
end

server -> mongo ++ : Reset failedAttempts = 0
mongo --> server --

server -> mongo ++ : Update lastLogin timestamp
mongo --> server --

server ->> email : sendLoginAlert(email) [async]
note right of email : Non-blocking

server -> mongo ++ : insertOne(securityAudit: login_success)
mongo --> server --

server -> server : Generate JWT access token (1h)\\nGenerate refresh token (30d)

server -> mongo ++ : insertOne(Session {\\naccessTokenHash, refreshTokenHash,\\ndeviceInfo, ipAddress})
mongo --> server --

server --> browser -- : 200 {\\n  token,\\n  refreshToken,\\n  sessionId,\\n  user: {id, email, role}\\n}

browser -> user : Redirect to /dashboard
deactivate browser

@enduml
""".strip()

# ════════════════════════════════════════════════════════════════════════════════
# 3. SEQUENCE DIAGRAM — OAUTH 2.0 PKCE AUTHORIZATION CODE FLOW
# ════════════════════════════════════════════════════════════════════════════════
SEQ_OAUTH = """
@startuml
!theme plain
skinparam defaultFontName Arial
skinparam defaultFontSize 11
skinparam sequenceMessageAlign center
skinparam ParticipantBackgroundColor #FFFBCC
skinparam ParticipantBorderColor    #B8860B
skinparam ArrowColor #444444

title OAuth 2.0 PKCE Authorization Code Flow

actor       "User"         as user
participant "Client App\\n(port 3001)" as client #EEF5FF
participant "Auth Server\\n(port 80)"  as server #E8F5E9
participant "MongoDB"      as mongo  #FFF3E0

== Step 1: Initiate Login ==
user -> client  : GET /login
client -> client : Generate code_verifier (32 random bytes)\\ncode_challenge = BASE64URL(SHA256(verifier))
client -> client : Store code_verifier in HttpOnly cookie\\nGenerate random state
client --> user  : 302 Redirect to Auth Server\\n/api/oauth/authorize?\\n  client_id=...&response_type=code\\n  &scope=openid profile email\\n  &state=...&code_challenge=...\\n  &code_challenge_method=S256

== Step 2: Auth Server Validates Request ==
user -> server  : GET /api/oauth/authorize?...
server -> mongo : Find Client by client_id
mongo --> server : Client record
server -> server : Validate redirect_uri matches\\nValidate requested scopes

alt User NOT logged in
  server --> user : Redirect to /login.html?returnTo=...
  user -> server  : POST /api/auth/login {email, password}
  server --> user : 200 + session cookie set
  user -> server  : GET /api/oauth/authorize (resumed)
end

server -> mongo : Find Consent (userId + clientId)

alt Consent NOT previously granted
  server --> user : 200 Show consent form\\n(client name, requested scopes)
  user -> server  : POST /api/oauth/authorize\\n{action: "consent", client_id, scope, state,\\n code_challenge, code_challenge_method}
  server -> mongo : insertOne(Consent {userId, clientId, scope, 30d TTL})
else Consent already exists
  note right of server : Skip consent form
end

== Step 3: Generate Authorization Code ==
server -> mongo : insertOne(AuthorizationCode {\\n  code: 64-char hex, clientId, userId,\\n  redirectUri, scope, code_challenge,\\n  expiresAt: 10 min})
server --> user : 302 Redirect to\\n  redirect_uri?code=...&state=...

== Step 4: Exchange Code for Tokens ==
user -> client  : GET /callback?code=...&state=...
client -> client : Verify state matches cookie\\nRead code_verifier from cookie
client -> server : POST /api/oauth/token {\\n  grant_type: authorization_code,\\n  code, client_id, client_secret,\\n  redirect_uri, code_verifier}

server -> mongo : Find AuthorizationCode by code
mongo --> server : Code record
server -> server : Check code not used & not expired\\nMark code as used (prevent replay)
server -> server : Verify PKCE:\\n  SHA256(code_verifier) == code_challenge
server -> server : bcrypt.compare(client_secret, hash)

server -> server : Generate tokens:\\n  access_token (JWT, 1h, scope)\\n  id_token (JWT, OpenID claims)\\n  refresh_token (JWT, 30d)
server -> mongo : Update Client stats (totalRequests, lastUsed)

server --> client : 200 {\\n  access_token,\\n  id_token,\\n  refresh_token,\\n  token_type: "Bearer",\\n  expires_in: 3600\\n}

== Step 5: Fetch User Info ==
client -> server : GET /api/oauth/userinfo\\nAuthorization: Bearer <access_token>
server -> server : Verify JWT signature & expiry
server --> client : 200 {\\n  sub, email, name,\\n  email_verified\\n}
client -> client : Store accessToken in session
client --> user  : Redirect to /dashboard

@enduml
""".strip()

# ════════════════════════════════════════════════════════════════════════════════
# 4. DFD LEVEL 0 — CONTEXT DIAGRAM
# ════════════════════════════════════════════════════════════════════════════════
DFD_L0 = """
@startuml
!theme plain
skinparam defaultFontName Arial
skinparam defaultFontSize 13
skinparam componentStyle rectangle
skinparam ArrowColor #444444
skinparam ComponentBackgroundColor #EEF5FF
skinparam ComponentBorderColor     #2F6FAE
skinparam ComponentFontSize        13
skinparam NoteBackgroundColor      #FFFBCC
skinparam NoteBorderColor          #B8860B

title Data Flow Diagram — Level 0 (Context Diagram)

' ── External Entities ──
[User\\n(End User)] as USER <<External Entity>>
[Admin] as ADMIN <<External Entity>>
[OAuth Client\\nApplication] as OAUTH_CLIENT <<External Entity>>
[Google OAuth\\nProvider] as GOOGLE <<External Entity>>
[GitHub OAuth\\nProvider] as GITHUB <<External Entity>>
[Email Service\\n(SMTP)] as EMAIL_SVC <<External Entity>>

' ── System ──
rectangle "                    TAS Authentication Server                    " as TAS #EEF5FF {
}

' ── User flows ──
USER -right-> TAS : Registration data\\nLogin credentials\\nProfile updates\\nPassword change\\nOAuth consent
TAS -left-> USER  : JWT tokens\\nSession info\\nProfile data\\nAudit log\\nExported data

' ── Admin flows ──
ADMIN -down-> TAS : Filter/query requests\\nExport requests
TAS -up-> ADMIN   : Analytics reports\\nAudit logs\\nMonitoring data\\nUser list

' ── OAuth Client flows ──
OAUTH_CLIENT -down-> TAS : Authorization request\\nToken exchange request\\nToken refresh request
TAS -up-> OAUTH_CLIENT   : Authorization code\\nAccess token / ID token\\nUser info (userinfo)

' ── Social login flows ──
GOOGLE -down-> TAS  : Google user profile\\nGoogle ID
GITHUB -down-> TAS  : GitHub user profile\\nGitHub ID

' ── Email flows ──
TAS -right-> EMAIL_SVC : Email verification request\\nPassword reset email\\nLogin alert notification

@enduml
""".strip()

# ════════════════════════════════════════════════════════════════════════════════
# 5. DFD LEVEL 1 — PROCESS DECOMPOSITION
# ════════════════════════════════════════════════════════════════════════════════
DFD_L1 = """
@startuml
!theme plain
skinparam defaultFontName Arial
skinparam defaultFontSize 11
skinparam ArrowColor #444444
skinparam rectangle {
  BackgroundColor #FFFBCC
  BorderColor #B8860B
  FontSize 11
}

title Data Flow Diagram — Level 1 (Process Decomposition)

' ═══ External Entities ═══
rectangle "User"              as USER
rectangle "Admin"             as ADMIN
rectangle "OAuth Client App"  as OAUTH_CLIENT
rectangle "Google OAuth"      as GOOGLE
rectangle "GitHub OAuth"      as GITHUB
rectangle "Email Service"     as EMAIL

' ═══ Processes (DFD circles — shown as blue rectangles) ═══
rectangle "P1: User Authentication\\n(register / login / logout\\n/ social login)" as P1 #EEF5FF
rectangle "P2: OAuth 2.0 Server\\n(authorize / token /\\nintrospect / revoke)" as P2 #EEF5FF
rectangle "P3: Session & Token\\nManagement\\n(create / refresh / revoke)" as P3 #EEF5FF
rectangle "P4: User Profile\\nManagement\\n(CRUD / PDPA / preferences)" as P4 #EEF5FF
rectangle "P5: Admin Dashboard\\n(analytics / logs /\\nmonitoring)" as P5 #EEF5FF

' ═══ Data Stores (green rectangles — Yourdon open-rectangle notation) ═══
rectangle "= D1  Users =\\n(MongoDB)" as D1 #E8F5E9
rectangle "= D2  Sessions =\\n(MongoDB + Redis)" as D2 #E8F5E9
rectangle "= D3  OAuth Clients\\n& Auth Codes =\\n(MongoDB)" as D3 #E8F5E9
rectangle "= D4  Token Blacklist =\\n(MongoDB)" as D4 #E8F5E9
rectangle "= D5  Security Audit Log =\\n(MongoDB)" as D5 #E8F5E9

' ─── User ↔ P1 ───
USER --> P1 : credentials / registration data
P1 --> USER : JWT token / auth result

' ─── Social login ───
GOOGLE --> P1 : Google profile
GITHUB --> P1 : GitHub profile

' ─── Email ───
P1 --> EMAIL : verification / alert email

' ─── P1 ↔ Data Stores ───
P1 --> D1 : create/update user record
D1 --> P1 : user data (lookup by email)
P1 --> D2 : create session
P1 --> D5 : log login_success / login_failed

' ─── User ↔ P2 ───
USER --> P2 : OAuth consent grant/deny
OAUTH_CLIENT --> P2 : auth request / token exchange
P2 --> OAUTH_CLIENT : auth code / tokens / user info

' ─── P2 ↔ Data Stores ───
D3 --> P2 : client record / auth code lookup
P2 --> D3 : store consent / auth code
D4 --> P2 : check blacklisted token
P2 --> D5 : log token_issued / consent_granted

' ─── P3 ───
P1 --> P3 : new session data
P3 --> D2 : update / revoke session
D4 --> P3 : check blacklist
P3 --> D4 : add revoked token
P3 --> D5 : log token_refreshed / session_revoked

' ─── User ↔ P4 ───
USER --> P4 : profile update / PDPA request
P4 --> USER : profile data / exported data
P4 --> D1  : update user record
D1  --> P4 : read user record

' ─── Admin ↔ P5 ───
ADMIN --> P5 : query / filter / export request
P5 --> ADMIN : analytics / logs / monitoring data
D5  --> P5  : security events
D2  --> P5  : session counts
D1  --> P5  : user statistics

@enduml
""".strip()

# ═══ Render All ════════════════════════════════════════════════════════════════
DIAGRAMS = {
    'usecase':          USECASE,
    'sequence-login':   SEQ_LOGIN,
    'sequence-oauth':   SEQ_OAUTH,
    'dfd-level0':       DFD_L0,
    'dfd-level1':       DFD_L1,
}

for name, src in DIAGRAMS.items():
    render(name, src)

print('\nDone. PNG files saved to:', OUT)
