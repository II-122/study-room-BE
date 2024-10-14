import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../users/users.schema';
import { UsersService } from 'src/users/users.service';
import { CreateUserDto } from 'src/users/dto/createUser.dto';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenDto } from './dto/refreshToken.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private configService: ConfigService,
    private jwtService: JwtService
  ) {}

  getJwtAccessToken(user: User): string {
    const payload = { id: user.id, _id: user._id };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '15m',
    });
  }

  getJwtRefreshToken(user: User): string {
    const payload = { id: user.id, _id: user._id };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
  }

  async signUp(createUserDto: CreateUserDto): Promise<void> {
    const saltOrRounds = 10;
    const hashedPassword = await bcrypt.hash(
      createUserDto.password,
      saltOrRounds
    );

    await this.usersService.create({
      ...createUserDto,
      password: hashedPassword,
    });
  }

  async checkDuplicate(field: string, value: string): Promise<void> {
    const isDuplicate = await this.usersService.checkDuplicate(field, value);
    if (isDuplicate) {
      throw new ConflictException(`이미 사용 중인 ${field}입니다.`);
    }
  }

  async validateUser(id: string, password: string): Promise<User> {
    const user = await this.usersService.findOneById(id);

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('비밀번호가 잘못되었습니다.');
    }

    return user;
  }

  async login(user: User, res) {
    const accessToken = this.getJwtAccessToken(user);
    const refreshToken = this.getJwtRefreshToken(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'None',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      accessToken: accessToken,
      user: {
        id: user.id,
        nickname: user.nickname,
        imageUrl: user.imageUrl,
        introduction: user.introduction,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<RefreshTokenDto> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findOneById(payload.id);

      const newAccessToken = this.getJwtAccessToken(user);

      return {
        accessToken: newAccessToken,
        user: {
          id: user.id,
          nickname: user.nickname,
          imageUrl: user.imageUrl,
          introduction: user.introduction,
        },
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('리프레시 토큰이 만료되었습니다.');
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
      } else {
        console.error('Unexpected error:', error);
        throw new UnauthorizedException(
          '리프레시 토큰 처리 중 오류가 발생했습니다.'
        );
      }
    }
  }

  async verifyPassword(
    userId: string,
    currentPassword: string
  ): Promise<boolean> {
    const user = await this.usersService.findOneById(userId);

    const isPasswordCorrect = await bcrypt.compare(
      currentPassword,
      user.password
    );
    return isPasswordCorrect;
  }

  async changePassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findOneById(userId);

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();
  }
}
