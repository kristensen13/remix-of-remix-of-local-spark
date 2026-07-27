export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  inviteCode: string;
}

export interface AuthResponse {
  token: string;
}
