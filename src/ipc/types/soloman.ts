import { z } from "zod";
import { defineContract, defineEvent, createClient, createEventClient } from "../contracts/core";

// =============================================================================
// Soloman Schemas
// =============================================================================

export const SolomanHostStatusSchema = z.object({
  enrolled: z.boolean(),
  deviceId: z.string().nullable(),
  deviceName: z.string().nullable(),
  cloudUrl: z.string(),
  isRelayConnected: z.boolean(),
  activeGrantsCount: z.number(),
  pendingPairingsCount: z.number(),
  lastConnectedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  accountEmail: z.string().nullable().optional(),
  autoTrustAccountDevices: z.boolean().optional(),
});

export type SolomanHostStatusPayload = z.infer<typeof SolomanHostStatusSchema>;

export const SolomanPairingDeviceSummarySchema = z.object({
  deviceId: z.string(),
  name: z.string(),
  deviceType: z.enum(["desktop", "mobile", "web"]),
});

export const SolomanPairingSchema = z.object({
  pairingId: z.string(),
  controllerDevice: SolomanPairingDeviceSummarySchema,
  hostDevice: SolomanPairingDeviceSummarySchema,
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  expiresAt: z.string(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type SolomanPairingPayload = z.infer<typeof SolomanPairingSchema>;

export const DeviceConnectionGrantSchema = z.object({
  grantId: z.string(),
  controllerDeviceId: z.string(),
  hostDeviceId: z.string(),
  status: z.enum(["active", "revoked", "expired"]),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type DeviceConnectionGrantPayload = z.infer<typeof DeviceConnectionGrantSchema>;

export const EnrollDeviceInputSchema = z.object({
  enrollmentCode: z.string().optional(),
  deviceName: z.string().optional(),
  cloudUrl: z.string().optional(),
});

export const ApprovePairingInputSchema = z.object({
  pairingId: z.string(),
  verificationCode: z.string().min(1),
});

export const RevokeGrantInputSchema = z.object({
  grantId: z.string(),
});

// =============================================================================
// Soloman Contracts
// =============================================================================

export const solomanContracts = {
  getStatus: defineContract({
    channel: "soloman:get-status",
    input: z.void(),
    output: SolomanHostStatusSchema,
  }),

  enrollDevice: defineContract({
    channel: "soloman:enroll-device",
    input: EnrollDeviceInputSchema,
    output: SolomanHostStatusSchema,
  }),

  listPendingPairings: defineContract({
    channel: "soloman:list-pending-pairings",
    input: z.void(),
    output: z.object({
      pairings: z.array(SolomanPairingSchema),
    }),
  }),

  approvePairing: defineContract({
    channel: "soloman:approve-pairing",
    input: ApprovePairingInputSchema,
    output: z.object({
      grant: DeviceConnectionGrantSchema,
    }),
  }),

  listGrants: defineContract({
    channel: "soloman:list-grants",
    input: z.void(),
    output: z.object({
      grants: z.array(DeviceConnectionGrantSchema),
    }),
  }),

  revokeGrant: defineContract({
    channel: "soloman:revoke-grant",
    input: RevokeGrantInputSchema,
    output: z.object({
      ok: z.literal(true),
    }),
  }),

  connectRelay: defineContract({
    channel: "soloman:connect-relay",
    input: z.void(),
    output: z.object({
      ok: z.literal(true),
    }),
  }),

  disconnectRelay: defineContract({
    channel: "soloman:disconnect-relay",
    input: z.void(),
    output: z.object({
      ok: z.literal(true),
    }),
  }),

  startBrowserLogin: defineContract({
    channel: "soloman:start-browser-login",
    input: z.object({
      deviceName: z.string().optional(),
      cloudUrl: z.string().optional(),
    }),
    output: z.object({
      sessionId: z.string(),
      authUrl: z.string(),
    }),
  }),

  directLogin: defineContract({
    channel: "soloman:direct-login",
    input: z.object({
      username: z.string().min(1),
      password: z.string().min(1),
      deviceName: z.string().optional(),
      cloudUrl: z.string().optional(),
    }),
    output: SolomanHostStatusSchema,
  }),

  checkLoginSession: defineContract({
    channel: "soloman:check-login-session",
    input: z.object({
      sessionId: z.string(),
    }),
    output: z.object({
      completed: z.boolean(),
      status: SolomanHostStatusSchema,
    }),
  }),

  simulateBrowserLogin: defineContract({
    channel: "soloman:simulate-browser-login",
    input: z.object({
      email: z.string().optional(),
      deviceName: z.string().optional(),
    }),
    output: SolomanHostStatusSchema,
  }),

  logout: defineContract({
    channel: "soloman:logout",
    input: z.void(),
    output: z.object({
      ok: z.literal(true),
    }),
  }),
} as const;

// =============================================================================
// Soloman Events
// =============================================================================

export const solomanEvents = {
  pairingRequested: defineEvent({
    channel: "soloman:pairing-requested",
    payload: SolomanPairingSchema,
  }),

  statusChanged: defineEvent({
    channel: "soloman:status-changed",
    payload: SolomanHostStatusSchema,
  }),
} as const;

// =============================================================================
// Soloman Clients
// =============================================================================

export const solomanClient = createClient(solomanContracts);
export const solomanEventClient = createEventClient(solomanEvents);
