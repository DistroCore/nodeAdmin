import { Body, Controller, ForbiddenException, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { runtimeConfig } from '../../app/runtimeConfig';
import { AuditLogService } from '../../infrastructure/audit/auditLogService';
import { AuthService } from './authService';
import { ChangePasswordDto } from './dto/changePasswordDto';
import { IssueDevTokenDto } from './dto/issueDevTokenDto';
import { LoginDto } from './dto/loginDto';
import { RefreshTokenDto } from './dto/refreshTokenDto';
import { RegisterDto } from './dto/registerDto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user', security: [] })
  async register(@Body() dto: RegisterDto) {
    const { name, roles, tokens, userId } = await this.authService.register(
      dto.email,
      dto.password,
      dto.tenantId,
      dto.name
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
    const { name, roles, tokens, userId } = await this.authService.login(
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
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: Request) {
    const user = (req as any).user;
    if (!user?.userId || !user?.tenantId) {
      throw new ForbiddenException('Not authenticated.');
    }
    await this.authService.changePassword(
      user.userId,
      user.tenantId,
      dto.currentPassword,
      dto.newPassword
    );
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
}
