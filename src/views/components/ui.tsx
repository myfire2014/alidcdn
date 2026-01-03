import { Html } from '@elysiajs/html';

// Alert Component
interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  dismissible?: boolean;
}

const alertStyles = {
  success: 'bg-green-50 text-green-800 border-green-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200'
};

export function Alert({ type, message, dismissible }: AlertProps) {
  return (
    <div class={`p-4 rounded-lg border ${alertStyles[type]} flex justify-between items-center`}>
      <span>{message}</span>
      {dismissible && (
        <button onclick="this.parentElement.remove()" class="ml-4 hover:opacity-70">✕</button>
      )}
    </div>
  );
}

// Button Component
interface ButtonProps {
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  children: JSX.Element | string;
  [key: string]: unknown;
}

const buttonVariants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-indigo-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
};

const buttonSizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base'
};

export function Button({ type = 'button', variant = 'primary', size = 'md', disabled, loading, children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      class={`inline-flex items-center justify-center font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonVariants[variant]} ${buttonSizes[size]}`}
      {...props}
    >
      {loading && <LoadingSpinner class="mr-2 h-4 w-4" />}
      {children}
    </button>
  );
}

// Card Component
interface CardProps {
  title?: string;
  children: JSX.Element | JSX.Element[];
  class?: string;
}

export function Card({ title, children, class: className = '' }: CardProps) {
  return (
    <div class={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
      {title && <h3 class="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}
      {children}
    </div>
  );
}

// Loading Spinner
interface LoadingSpinnerProps {
  class?: string;
}

export function LoadingSpinner({ class: className = 'h-5 w-5' }: LoadingSpinnerProps) {
  return (
    <svg class={`animate-spin text-current ${className}`} fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

// Status Badge
interface StatusBadgeProps {
  status: 'valid' | 'expiring_soon' | 'expired' | 'unknown' | 'error';
}

const statusStyles = {
  valid: 'bg-green-100 text-green-800',
  expiring_soon: 'bg-yellow-100 text-yellow-800',
  expired: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800',
  error: 'bg-red-100 text-red-800'
};

const statusLabels = {
  valid: '正常',
  expiring_soon: '即将过期',
  expired: '已过期',
  unknown: '未知',
  error: '错误'
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

// Empty State
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: JSX.Element;
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div class="text-center py-12">
      <div class="text-4xl mb-4">{icon}</div>
      <h3 class="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {description && <p class="text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  );
}
