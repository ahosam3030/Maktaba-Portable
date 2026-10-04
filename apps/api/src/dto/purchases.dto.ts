import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PurchaseItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MaxLength(200)
  productName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  piecesPerPack?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;
}

export class CreatePurchaseInvoiceDto {
  @IsString()
  supplierId!: string;

  @IsString()
  @MaxLength(80)
  invoiceNumber!: string;

  @IsOptional()
  @IsString()
  invoiceDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

export class SupplierPaymentDto {
  @IsString()
  supplierId!: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
