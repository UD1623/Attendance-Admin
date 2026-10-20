import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const mockSignIn = vi.fn();
const mockResetPassword = vi.fn();

vi.mock('@/app/AuthProvider', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    resetPassword: mockResetPassword,
    user: null,
    isAdmin: false,
    isSuperAdmin: false,
    role: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

describe('LoginPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form elements', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: /administrator login/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/administrator email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to dashboard/i })).toBeInTheDocument();
  });

  it('validates empty inputs on submit', async () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const submitBtn = screen.getByRole('button', { name: /sign in to dashboard/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/valid administrator email/i)).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('calls signIn on valid credentials submission', async () => {
    mockSignIn.mockResolvedValueOnce(undefined);

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    await userEvent.type(screen.getByLabelText(/administrator email/i), 'admin@institution.edu');
    await userEvent.type(screen.getByLabelText(/password/i), 'SecurePass123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in to dashboard/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('admin@institution.edu', 'SecurePass123!');
    });
  });

  it('triggers Quick Sign-In with SuperAdmin dev credentials', async () => {
    mockSignIn.mockResolvedValueOnce(undefined);

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const quickBtn = screen.getByRole('button', { name: /quick sign-in as superadmin/i });
    await userEvent.click(quickBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('admin@attendance.local', 'AdminPass123!');
    });
  });

  it('displays descriptive message on auth/configuration-not-found error', async () => {
    mockSignIn.mockRejectedValueOnce({
      code: 'auth/configuration-not-found',
      message: 'Firebase: Error (auth/configuration-not-found).',
    });

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    await userEvent.type(screen.getByLabelText(/administrator email/i), 'admin@institution.edu');
    await userEvent.type(screen.getByLabelText(/password/i), 'SecurePass123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in to dashboard/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Firebase Authentication is not yet enabled for project smartattendanceiot-43fa2/i)
      ).toBeInTheDocument();
    });
  });
});
