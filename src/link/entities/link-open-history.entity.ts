import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Link } from './link.entity';

@Entity()
export class LinkOpenHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true })
  user: User;

  @ManyToOne(() => Link, { eager: true })
  link: Link;

  @CreateDateColumn()
  openedAt: Date;
}
