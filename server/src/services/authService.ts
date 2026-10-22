import crypto from "crypto";
import { query } from "../db/connection.js";
import { config } from "../config/index.js";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "moderator" | "contributor" | "user";
  reputationScore: number;
}

export class AuthService {
  /**
   * Hash a password securely using PBKDF2/scrypt
   */
  public static async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString("hex");
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(`${salt}:${derivedKey.toString("hex")}`);
      });
    });
  }

  /**
   * Verify password against hash
   */
  public static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    return new Promise((resolve) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) return resolve(false);
        resolve(crypto.timingSafeEqual(Buffer.from(key, "hex"), derivedKey));
      });
    });
  }

  /**
   * Create a simple secure signed token
   */
  public static createToken(user: User): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 3600), // 7 days
    })).toString("base64url");

    const signature = crypto
      .createHmac("sha256", config.jwtSecret)
      .update(`${header}.${payload}`)
      .digest("base64url");

    return `${header}.${payload}.${signature}`;
  }

  /**
   * Verify and decode a token
   */
  public static verifyToken(token: string): { sub: string; email: string; role: string; fullName: string } | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const [header, payload, signature] = parts;

      const expectedSig = crypto
        .createHmac("sha256", config.jwtSecret)
        .update(`${header}.${payload}`)
        .digest("base64url");

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return null;
      }

      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
      if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Register a new user
   */
  public static async register(email: string, password: string, fullName: string, role: User["role"] = "user"): Promise<{ user: User; token: string }> {
    const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      throw new Error("A user with this email address already exists.");
    }

    const userId = `USR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hash = await this.hashPassword(password);

    await query(`
      INSERT INTO users (id, email, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, email.toLowerCase().trim(), hash, fullName.trim(), role]);

    const user: User = {
      id: userId,
      email: email.toLowerCase().trim(),
      fullName: fullName.trim(),
      role,
      reputationScore: 10,
    };

    const token = this.createToken(user);
    return { user, token };
  }

  /**
   * Authenticate a user
   */
  public static async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await query("SELECT id, email, password_hash, full_name, role, reputation_score FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (res.rows.length === 0) {
      throw new Error("Invalid email or password.");
    }

    const row = res.rows[0];
    const valid = await this.verifyPassword(password, row.password_hash);
    if (!valid) {
      throw new Error("Invalid email or password.");
    }

    const user: User = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      reputationScore: row.reputation_score,
    };

    const token = this.createToken(user);
    return { user, token };
  }

  /**
   * Retrieve user by ID
   */
  public static async getUserById(id: string): Promise<User | null> {
    const res = await query("SELECT id, email, full_name, role, reputation_score FROM users WHERE id = $1", [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      reputationScore: row.reputation_score,
    };
  }

  /**
   * Seed default demo users (admin, moderator, contributor, user) if empty
   */
  public static async seedDefaultUsers(): Promise<void> {
    const res = await query("SELECT count(*) as count FROM users");
    if (parseInt(res.rows[0].count, 10) === 0) {
      await this.register("admin@transittrack.chennai", "AdminChennai2026!", "Transit Administrator", "admin");
      await this.register("moderator@transittrack.chennai", "ModChennai2026!", "Community Moderator", "moderator");
      await this.register("contributor@transittrack.chennai", "Contribute2026!", "Active Commuter", "contributor");
      await this.register("rider@transittrack.chennai", "Rider2026!", "Regular Passenger", "user");
    }
  }
}
