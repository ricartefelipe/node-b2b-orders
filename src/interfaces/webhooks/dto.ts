import { IsArray, IsString, IsUrl, ArrayMinSize } from 'class-validator';

export class CreateWebhookDto {
  @IsUrl({ require_tld: false })
  url!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  events!: string[];

  @IsString()
  secret!: string;
}

export interface WebhookEndpointResponse {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
}

export interface WebhookDeliveryResponse {
  id: string;
  eventType: string;
  status: string;
  httpStatus: number | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}
