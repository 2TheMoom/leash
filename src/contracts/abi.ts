export const LEASH_FACTORY_ABI = [
  {
    type: 'constructor',
    inputs: [{ name: 'usdc_', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createVault',
    inputs: [{ name: 'autoReleaseDelay', type: 'uint32' }],
    outputs: [{ name: 'vault', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'vaultsOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'vaults', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'usdc',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'VaultCreated',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
    ],
  },
  { type: 'error', name: 'ZeroUSDC', inputs: [] },
] as const

export const LEASH_VAULT_ABI = [
  // View
  {
    type: 'function', name: 'owner',
    inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'pendingOwner',
    inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'usdc',
    inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'frozen',
    inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'autoReleaseDelay',
    inputs: [], outputs: [{ type: 'uint32' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'reserved',
    inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'nextPaymentId',
    inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'available',
    inputs: [], outputs: [{ name: 'amount', type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'getPayment',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{
      name: 'payment', type: 'tuple',
      components: [
        { name: 'agent', type: 'address' },
        { name: 'payee', type: 'address' },
        { name: 'amount', type: 'uint128' },
        { name: 'queuedAt', type: 'uint48' },
        { name: 'ref', type: 'bytes32' },
        { name: 'status', type: 'uint8' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'getAgent',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{
      name: 'cfg', type: 'tuple',
      components: [
        { name: 'active', type: 'bool' },
        { name: 'perPaymentCap', type: 'uint128' },
        { name: 'dailyCap', type: 'uint128' },
        { name: 'spentInWindow', type: 'uint128' },
        { name: 'windowStart', type: 'uint48' },
        { name: 'pendingCount', type: 'uint32' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'allowedPayees',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  // Write - owner
  {
    type: 'function', name: 'setAgent',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'active', type: 'bool' },
      { name: 'perPaymentCap', type: 'uint128' },
      { name: 'dailyCap', type: 'uint128' },
    ],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setPayee',
    inputs: [{ name: 'payee', type: 'address' }, { name: 'allowed', type: 'bool' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setAutoReleaseDelay',
    inputs: [{ name: 'delay', type: 'uint32' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'freeze',
    inputs: [], outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'unfreeze',
    inputs: [], outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'approve',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'cancel',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'withdraw',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint128' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'proposeOwner',
    inputs: [{ name: 'proposed', type: 'address' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'acceptOwner',
    inputs: [], outputs: [], stateMutability: 'nonpayable',
  },
  // Write - agent
  {
    type: 'function', name: 'pay',
    inputs: [
      { name: 'payee', type: 'address' },
      { name: 'amount', type: 'uint128' },
      { name: 'ref', type: 'bytes32' },
    ],
    outputs: [
      { name: 'executed', type: 'bool' },
      { name: 'id', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  // Write - anyone
  {
    type: 'function', name: 'execute',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  // Events
  {
    type: 'event', name: 'AgentSet',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'active', type: 'bool', indexed: false },
      { name: 'perPaymentCap', type: 'uint128', indexed: false },
      { name: 'dailyCap', type: 'uint128', indexed: false },
    ],
  },
  {
    type: 'event', name: 'PayeeSet',
    inputs: [
      { name: 'payee', type: 'address', indexed: true },
      { name: 'allowed', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event', name: 'PaymentQueued',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'agent', type: 'address', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
      { name: 'ref', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event', name: 'PaymentExecuted',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'agent', type: 'address', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
    ],
  },
  {
    type: 'event', name: 'PaymentCancelled',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'agent', type: 'address', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
    ],
  },
  { type: 'event', name: 'VaultFrozen', inputs: [] },
  { type: 'event', name: 'VaultUnfrozen', inputs: [] },
  {
    type: 'event', name: 'Withdrawn',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
    ],
  },
  {
    type: 'event', name: 'OwnerProposed',
    inputs: [{ name: 'proposedOwner', type: 'address', indexed: true }],
  },
  {
    type: 'event', name: 'OwnerAccepted',
    inputs: [{ name: 'newOwner', type: 'address', indexed: true }],
  },
  {
    type: 'event', name: 'AutoReleaseDelaySet',
    inputs: [{ name: 'delay', type: 'uint32', indexed: false }],
  },
  // Custom errors
  { type: 'error', name: 'NotOwner', inputs: [] },
  { type: 'error', name: 'NotAgent', inputs: [] },
  { type: 'error', name: 'NotOwnerOrAgent', inputs: [] },
  { type: 'error', name: 'Frozen', inputs: [] },
  { type: 'error', name: 'AlreadyFrozen', inputs: [] },
  { type: 'error', name: 'NotFrozen', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'SelfPayee', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'AmountExceedsCap', inputs: [] },
  { type: 'error', name: 'DailyCapExceeded', inputs: [] },
  { type: 'error', name: 'InsufficientAvailable', inputs: [] },
  { type: 'error', name: 'AgentNotActive', inputs: [] },
  { type: 'error', name: 'AgentPerCapTooHigh', inputs: [] },
  { type: 'error', name: 'PendingCapReached', inputs: [] },
  { type: 'error', name: 'PaymentNotPending', inputs: [] },
  { type: 'error', name: 'AutoReleaseNotEnabled', inputs: [] },
  { type: 'error', name: 'TooEarly', inputs: [] },
  { type: 'error', name: 'NoPendingOwner', inputs: [] },
  { type: 'error', name: 'NotPendingOwner', inputs: [] },
  { type: 'error', name: 'SafeERC20FailedOperation', inputs: [{ name: 'token', type: 'address' }] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
] as const
