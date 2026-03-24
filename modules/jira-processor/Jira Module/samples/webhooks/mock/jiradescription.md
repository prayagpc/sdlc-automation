This feature enables users to create an account (registration)
and authenticate (login) using email and password.

The system must validate user input, securely store credentials,
and provide a secure authentication mechanism using tokens

This includes:

User Registration

User Login

Input validation

Error handling

Session management



Acceptance Criteria:

Scenario 1: Successful Registration
Given the user is on the registration page
When the user enters a valid email and password
And submits the form
Then the account should be created successfully
And the user should be redirected to the dashboard

Scenario 2: Duplicate Registration
Given the email already exists
When the user tries to register
Then the system should show "Email already registered

Scenario 3: Successful Login
Given the user is registered
When the user enters valid credentials
Then the user should be logged in
And redirected to the dashboard

Scenario 4: Invalid Login
Given the user enters incorrect credentials
Then the system should display "Invalid email or password"

Scenario 5: Input Validation
Given the user enters invalid email or empty fields
Then validation errors should be displayed

Scenario 6: Too Many Login Attempts
Given the user fails login 5 times
Then the account should be temporarily locked for 10 minutes



Definition of Done (DoD)

Registration and login APIs implemented

Password hashing using bcrypt

JWT authentication implemented

UI forms created and validated

Unit and integration tests passing

Code reviewed and merged

Feature deployed to staging environment

Technical Notes:- 

Backend:

POST /api/auth/register → create user

POST /api/auth/login → authenticate user

Use bcrypt for password hashing

Use JWT for authentication

Frontend:

Create registration and login forms

Validate inputs (email format, password length)

Handle API responses and errors

Security:

Implement rate limiting (max 5 login attempts)

Use HTTPS

Token expiry: 30 minutes

Input sanitization required

Database:

Users table/collection with fields:
email, password (hashed), createdAt, updatedAt



Subtasks

1. Create registration API
2. Create login API
3. Implement password hashing (bcrypt)
4. Implement JWT authentication
5. Create login & registration UI
6. Add validation and error handling
7. Write unit and integration test

