import { Module } from '@nestjs/common';
import { LinkController } from './link.controller';
import { LinkService } from './link.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Link } from './entities/link.entity';
import { AuthModule } from 'src/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { WebCrawlerService } from '../utils/crawler.util';
import { CategoryAnalyzerService } from '../utils/category-analyzer.util';
import { LinkOpenHistory } from './entities/link-open-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Link, LinkOpenHistory]),
    AuthModule,
    ConfigModule,
  ],
  controllers: [LinkController],
  providers: [LinkService, WebCrawlerService, CategoryAnalyzerService],
  exports: [LinkService],
})
export class LinkModule {}
