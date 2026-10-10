import { pool } from "../../lib/db.js";
import { requireAdmin } from "./middleware.js";
import { createAdminRepository } from "./repository.js";
import { createLoginLimiter } from "./rate-limit.js";
import { createAdminAuthService } from "./service.js";

export const adminRepository = createAdminRepository(pool);
export const adminAuthService = createAdminAuthService(
  adminRepository,
  createLoginLimiter(pool),
);
export const admin = requireAdmin(adminRepository);
