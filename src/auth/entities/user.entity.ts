import { Link } from 'src/link/entities/link.entity';
import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity()
@Unique(['email'])
export class User extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  loginType: 'email';

  @Column()
  email: string;

  @Column()
  password: string;

  @Column()
  userId: string;

  @Column()
  nickName: string;

  @Column({ nullable: true })
  imageUri?: string;

  @Column({ nullable: true })
  hashedRefreshToken?: string;

  @OneToMany(() => Link, (link) => link.user)
  links: Link[];
}
