import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { runtimeConfig } from '../../app/runtimeConfig';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { AuthService } from './authService';
import { IssueDevTokenDto } from './dto/issueDevTokenDto';
import { LoginDto } from './dto/loginDto';
import { RefreshTokenDto } from './dto/refreshTokenDto';
import { RegisterDto } from './dto/registerDto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const { userId, tokens } = await this.authService.register(
      dto.email,
      dto.password,
      dto.tenantId,
      dto.name
    );

    return {
      identity: { userId, tenantId: dto.tenantId },
      ...tokens,
    };
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const { userId, tokens } = await this.authService.login(
      dto.email,
      dto.password,
      dto.tenantId
    );

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
      identity: { userId, tenantId: dto.tenantId },
      ...tokens,
    };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokens = await this.authService.refreshTokens(dto.refreshToken);
    return tokens;
  }

  @Post('dev-token')
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
}
