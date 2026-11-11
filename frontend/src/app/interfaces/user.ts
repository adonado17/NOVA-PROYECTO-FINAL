export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ProfileResponse {
  user: AuthUser;
}
