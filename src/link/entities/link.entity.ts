import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { LinkOpenHistory } from './link-open-history.entity';

@Entity()
export class Link extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 2048 })
  url: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ nullable: true, length: 2048 })
  thumbnail: string;

  @ManyToOne(() => User, (user) => user.links)
  user: User;

  @OneToMany(() => LinkOpenHistory, (history) => history.link, { cascade: true })
  openHistories: LinkOpenHistory[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
