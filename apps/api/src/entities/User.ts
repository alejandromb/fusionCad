import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  /** Cognito `sub` claim (UUID from JWT) */
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName?: string;

  @Column({ type: 'varchar', length: 50, default: 'free' })
  plan!: string;

  /** free=1, pro=-1 (unlimited) */
  @Column({ type: 'int', default: 1 })
  maxCloudProjects!: number;

  /** AI generations used today */
  @Column({ type: 'int', default: 0 })
  aiGenerationsToday!: number;

  /** When the daily AI generation counter was last reset */
  @Column({ type: 'timestamp', nullable: true })
  aiGenerationsResetAt?: Date;

  /** free=10, pro=-1 (unlimited) */
  @Column({ type: 'int', default: 10 })
  maxAiGenerationsPerDay!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
