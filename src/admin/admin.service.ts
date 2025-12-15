import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Admin } from '../entities/admin.entity';
import { AdminLoginDto } from './dto/admin-login.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: AdminLoginDto) {
    const admin = await this.adminRepository.findOne({
      where: { email: loginDto.email, is_active: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      admin.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({
      id: admin.id,
      email: admin.email,
      role: 'admin',
    });

    return {
      success: true,
      message: 'Admin login successful',
      token,
    };
  }

  async getProfile(adminId: number) {
    const admin = await this.adminRepository.findOne({
      where: { id: adminId },
      select: ['id', 'email', 'is_active', 'created_at'],
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    return {
      success: true,
      admin,
    };
  }
}


