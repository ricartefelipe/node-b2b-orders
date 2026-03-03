import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../shared/auth/jwt.guard';
import { TenantGuard } from '../../shared/auth/tenant.guard';
import { Permission } from '../../shared/auth/permissions.decorator';
import { PermissionsGuard } from '../../shared/auth/permissions.guard';
import { AbacGuard } from '../../shared/auth/abac.guard';
import { CursorPageQuery } from '../../shared/pagination/cursor';

import { CreateProductDto, ProductFilterDto, UpdateProductDto } from './dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Id', required: true })
@Controller('products')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, AbacGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('metadata/categories')
  @Permission('products:read')
  async getCategories(@Req() req: any) {
    const tenantId = req.headers['x-tenant-id'];
    return this.products.getCategories(tenantId);
  }

  @Get('metadata/price-range')
  @Permission('products:read')
  async getPriceRange(@Req() req: any) {
    const tenantId = req.headers['x-tenant-id'];
    return this.products.getPriceRange(tenantId);
  }

  @Get()
  @Permission('products:read')
  async list(
    @Req() req: any,
    @Query() filters: ProductFilterDto,
    @Query() page: CursorPageQuery,
  ) {
    const tenantId = req.headers['x-tenant-id'];
    return this.products.list(
      tenantId,
      {
        category: filters.category,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        inStock: filters.inStock,
        searchTerm: filters.searchTerm,
      },
      page.cursor,
      page.limit,
    );
  }

  @Get(':id')
  @Permission('products:read')
  async getOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const tenantId = req.headers['x-tenant-id'];
    return this.products.findOne(tenantId, id);
  }

  @Post()
  @Permission('products:write')
  async create(@Req() req: any, @Body() body: CreateProductDto) {
    const tenantId = req.headers['x-tenant-id'];
    return this.products.create(tenantId, body);
  }

  @Patch(':id')
  @Permission('products:write')
  async update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductDto,
  ) {
    const tenantId = req.headers['x-tenant-id'];
    return this.products.update(tenantId, id, body);
  }

  @Delete(':id')
  @Permission('products:write')
  async remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const tenantId = req.headers['x-tenant-id'];
    return this.products.softDelete(tenantId, id);
  }
}
