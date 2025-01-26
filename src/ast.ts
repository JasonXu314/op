import { OpSpec } from './index.js';
import { OP } from './utils.js';

export type ASTLiteral<T> = string | number | T;

export interface ASTNode<T = any> {
	[OP]: OpSpec;
	left: ASTLiteral<T> | ASTNode<T>;
	right: ASTLiteral<T> | ASTNode<T> | (ASTLiteral<T> | ASTNode<T>)[];
}

