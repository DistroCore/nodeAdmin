import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, Redirect } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { runtimeConfig } from '../../app/runtimeConfig';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { AuthService } from './authService';
import { CurrentUser } from './currentUser.decorator';
import { AuthIdentity } from './authIdentity';
import { ChangePasswordDto } from './dto/changePasswordDto';
import { ResetPasswordDto } from './dto/resetPasswordDto';
import { IssueDevTokenDto } from './dto/issueDevTokenDto';
import { LoginDto } from './dto/loginDto';
import { RefreshTokenDto } from './dto/refreshTokenDto';
import { RegisterDto } from './dto/registerDto';
import { SendSmsDto } from './dto/sendSmsDto';
import { SmsLoginDto } from './dto/smsLoginDto';
import { OAuthLoginDto } from './dto/oauthLoginDto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user', security: [] })
  async register(@Body() dto: RegisterDto) {
    const { name, roles, tokens, userId } = await this.authService.register(
      dto.email,
      dto.password,
      dto.tenantId,
      dto.name,
    );

    return {
      identity: { roles, tenantId: dto.tenantId, userId },
      name,
      ...tokens,
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password', security: [] })
  async login(@Body() dto: LoginDto) {
    const { name, roles, tokens, userId } = await this.authService.login(dto.email, dto.password, dto.tenantId);

    try {
      await this.auditLogService.record({
        action: 'auth.login',
        targetId: userId,
        targetType: 'user',
        tenantId: dto.tenantId,
        traceId: tokens.accessToken.slice(0, 12),
        userId,
      });
    } catch {
      // Don't block login if audit fails
    }

    return {
      identity: { roles, tenantId: dto.tenantId, userId },
      name,
      ...tokens,
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token', security: [] })
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokens = await this.authService.refreshTokens(dto.refreshToken);
    return tokens;
  }

  @Post('change-password')
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'Change password for authenticated user' })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthIdentity) {
    await this.authService.changePassword(user.userId, user.tenantId, dto.currentPassword, dto.newPassword);
    return { success: true };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password via email', security: [] })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.newPassword, dto.tenantId);
    return { success: true };
  }

  @Post('dev-token')
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'Issue a dev token (dev mode only)', security: [] })
  async issueDevToken(@Body() payload: IssueDevTokenDto) {
    if (!runtimeConfig.auth.enableDevTokenIssue) {
      throw new ForbiddenException('Dev token issuance is disabled.');
    }

    const roles = payload.roles ?? ['super-admin'];
    const tokens = this.authService.issueTokens({
      roles,
      tenantId: payload.tenantId,
      userId: payload.userId,
    });

    return {
      identity: { roles, tenantId: payload.tenantId, userId: payload.userId },
      ...tokens,
    };
  }

  @Post('sms/send')
  @ApiOperation({ summary: 'Send SMS verification code', security: [] })
  async sendSms(@Body() dto: SendSmsDto) {
    const result = await this.authService.sendSmsCode(dto.phone);
    return result;
  }

  @Post('login/sms')
  @ApiOperation({ summary: 'Login with SMS verification code', security: [] })
  async loginWithSms(@Body() dto: SmsLoginDto) {
    const { name, roles, tokens, userId } = await this.authService.loginWithSms(dto.phone, dto.code, dto.tenantId);

    try {
      await this.auditLogService.record({
        action: 'auth.sms_login',
        targetId: userId,
        targetType: 'user',
        tenantId: dto.tenantId,
        traceId: tokens.accessToken.slice(0, 12),
        userId,
      });
    } catch {
      // Don't block login if audit fails
    }

    return {
      identity: { roles, tenantId: dto.tenantId, userId },
      name,
      ...tokens,
    };
  }

  @Post('login/oauth/:provider')
  @ApiOperation({ summary: 'Login with OAuth provider (github, google)', security: [] })
  async loginWithOAuth(@Body() dto: OAuthLoginDto) {
    const { name, roles, tokens, userId } = await this.authService.loginWithOAuth(dto.provider, dto.code, dto.tenantId);

    try {
      await this.auditLogService.record({
        action: `auth.oauth_login.${dto.provider}`,
        targetId: userId,
        targetType: 'user',
        tenantId: dto.tenantId,
        traceId: tokens.accessToken.slice(0, 12),
        userId,
      });
    } catch {
      // Don't block login if audit fails
    }

    return {
      identity: { roles, tenantId: dto.tenantId, userId },
      name,
      ...tokens,
    };
  }

  /**
   * GitHub OAuth callback — GitHub redirects here after user authorizes.
   * Exchanges the code for user info, creates/finds user, then redirects
   * to the frontend with tokens in the URL query params.
   */
  @Get('github/callback')
  @ApiOperation({ summary: 'GitHub OAuth callback (browser redirect)', security: [] })
  @Redirect()
  async githubCallback(@Query('code') code: string, @Query('state') state: string) {
    const frontendUrl = runtimeConfig.corsOrigins[0] ?? 'http://localhost:3000';

    if (!code) {
      return { statusCode: 302, url: `${frontendUrl}/login?error=oauth_no_code` };
    }

    // Decode state to get tenantId (base64-encoded JSON)
    let tenantId = 'default';
    try {
      if (state) {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { tenantId?: string };
        if (decoded.tenantId) tenantId = decoded.tenantId;
      }
    } catch {
      // Use default tenantId if state is malformed
    }

    try {
      const { name, roles, tokens, userId } = await this.authService.loginWithOAuth('github', code, tenantId);

      try {
        await this.auditLogService.record({
          action: 'auth.oauth_login.github',
          targetId: userId,
          targetType: 'user',
          tenantId,
          traceId: tokens.accessToken.slice(0, 12),
          userId,
        });
      } catch {
        // Don't block login if audit fails
      }

      const params = new URLSearchParams({
        accessToken: tokens.accessToken,
        name: name ?? '',
        refreshToken: tokens.refreshToken,
        roles: roles.join(','),
        tenantId,
        tokenType: tokens.tokenType,
        userId,
      });

      return { statusCode: 302, url: `${frontendUrl}/auth/callback?${params.toString()}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OAuth login failed';
      return { statusCode: 302, url: `${frontendUrl}/login?error=${encodeURIComponent(message)}` };
    }
  }

  @Get('oauth-accounts')
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'List linked OAuth accounts' })
  async listOAuthAccounts(@CurrentUser() user: AuthIdentity) {
    const accounts = await this.authService.listOAuthAccounts(user.userId);
    return { accounts };
  }

  @Delete('oauth-accounts/:provider')
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'Unlink an OAuth provider' })
  async unlinkOAuthAccount(@Param('provider') provider: string, @CurrentUser() user: AuthIdentity) {
    await this.authService.unlinkOAuthAccount(user.userId, provider);
    return { success: true };
  }
}
