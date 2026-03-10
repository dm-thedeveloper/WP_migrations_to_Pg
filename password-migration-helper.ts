/**
 * WordPress Password Migration Helper
 *
 * WordPress uses phpass hashing which is different from modern bcrypt/argon2.
 * This file provides utilities to handle WordPress passwords.
 */

import * as crypto from "crypto";

/**
 * WordPress password verification (simplified phpass implementation)
 *
 * Note: This is a basic implementation. For production, consider using
 * a proper phpass library like 'wordpress-hash-node'
 */
export class WordPressPasswordHelper {
  /**
   * Check if a password hash is a WordPress hash
   */
  static isWordPressHash(hash: string): boolean {
    return hash.startsWith("$P$") || hash.startsWith("$H$");
  }

  /**
   * Verify a password against a WordPress hash
   *
   * For production use, install: npm install wordpress-hash-node
   * Then import: import { CheckPassword } from 'wordpress-hash-node';
   */
  static async verifyPassword(
    plainPassword: string,
    wpHash: string
  ): Promise<boolean> {
    // For production implementation, use:
    // const { CheckPassword } = require('wordpress-hash-node');
    // return CheckPassword(plainPassword, wpHash);

    console.warn("WordPress password verification not fully implemented");
    console.warn("Install: npm install wordpress-hash-node");
    return false;
  }

  /**
   * Generate a password reset token
   */
  static generateResetToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Mark user for password reset
   */
  static async forcePasswordReset(prisma: any, userId: number): Promise<void> {
    const resetToken = this.generateResetToken();
    const resetExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.user.update({
      where: { id: userId },
      data: {
        // Store reset token if you have these fields
        otp: resetToken,
        otpExpiry: resetExpiry,
        // Or mark for mandatory password change
        // mustChangePassword: true,
      },
    });
  }
}

/**
 * Migration Strategy Options
 */
export enum PasswordMigrationStrategy {
  /**
   * Keep WordPress hashes, verify on login, upgrade to bcrypt on success
   * - Seamless for users
   * - Requires WordPress password verification library
   */
  LAZY_MIGRATION = "lazy",

  /**
   * Force all users to reset passwords
   * - Simple implementation
   * - Inconvenient for users
   */
  FORCE_RESET = "force",

  /**
   * Generate random passwords and email users
   * - Good security
   * - Requires email system
   */
  RANDOM_WITH_EMAIL = "random",
}

/**
 * Example: Lazy Migration Authentication
 *
 * Add this to your authentication service:
 */
export class AuthService {
  /**
   * Login handler with WordPress password migration
   */
  async login(email: string, password: string, prisma: any) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new Error("User not found");
    }

    // Check if it's a WordPress password
    if (WordPressPasswordHelper.isWordPressHash(user.password)) {
      // Verify WordPress password
      const isValid = await WordPressPasswordHelper.verifyPassword(
        password,
        user.password
      );

      if (isValid) {
        // Upgrade to modern hash (bcrypt/argon2)
        // const bcrypt = require('bcrypt');
        // const newHash = await bcrypt.hash(password, 10);

        // await prisma.user.update({
        //   where: { id: user.id },
        //   data: { password: newHash }
        // });

        return { success: true, user };
      }

      throw new Error("Invalid password");
    }

    // Normal password verification (bcrypt/argon2)
    // const bcrypt = require('bcrypt');
    // const isValid = await bcrypt.compare(password, user.password);

    // if (!isValid) throw new Error('Invalid password');

    return { success: true, user };
  }
}

/**
 * Installation instructions for production:
 *
 * 1. Install WordPress password library:
 *    npm install wordpress-hash-node
 *
 * 2. Install bcrypt for new passwords:
 *    npm install bcrypt
 *    npm install @types/bcrypt --save-dev
 *
 * 3. Implement lazy migration:
 *    - Keep WordPress hashes during migration
 *    - On first login, verify WP password
 *    - If valid, rehash with bcrypt and update
 *
 * 4. Or force password reset:
 *    - Generate reset tokens for all migrated users
 *    - Send password reset emails
 *    - Users create new passwords
 */

export default WordPressPasswordHelper;
