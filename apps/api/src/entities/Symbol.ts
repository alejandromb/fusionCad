import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Persisted symbol definition.
 * The full SymbolDefinition is stored in the `definition` jsonb column.
 * Top-level columns (name, category, etc.) enable queries without parsing JSON.
 */
@Entity('symbols')
export class Symbol {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  category!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  standard?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source?: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  tagPrefix?: string;

  @Column({ type: 'jsonb' })
  definition!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
