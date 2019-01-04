import * as ts from 'typescript';

export const defaultOptions = {
  /**
   * React.lazy() only offically supports default exports, but it works if you do:
   * `React.lazy(() => import('./x').then(m => ({ default: m.Xyz })))`
   * This lets you rewrite all imported components. Once React supports a better way to import
   * named exports this transform will be updated to that.
   */
  onlyRewriteDefaultExports: false,
  /**
   * If the import declaration can't be removed because both a component and another function
   * is imported this lets you skip converting to a lazy component since it'll probably be
   * placed in the same bundle either way. The default is `false` since other imports might
   * be dead code eliminated without this transform knowing about it.
   */
  onlyRewriteIfImportCanBeRemoved: false,
  /**
   * Defaults to creating a PropertyAccessExpression of `React.lazy` but can be any expression you want.
   * Use `Options.createImportDeclaration()` if you need to import something from another module to call.
   */
  createComponentWrapperExpression: (typescript: typeof ts): ts.Expression => {
    return typescript.createPropertyAccess(typescript.createIdentifier('React'), typescript.createIdentifier('lazy'));
  },
  /**
   * Implement this if you want to import another module which contains your wrapper expression.
   * This can be used if you want to replace `React.lazy()` with something else.
   */
  createImportDeclaration: (typescript: typeof ts, currentFile: string): ts.ImportDeclaration | null => {
    return null;
  },
  /**
   * This lets you bail on rewriting imports on a per import declaration basis. If you have a list of
   * files to load sync (from for example https://github.com/avensia-oss/ts-transform-instrument-react-components)
   * you can implement this function to only rewrite imports from those files.
   */
  shouldRewrite: (importSpecifier: string, currentFile: string) => {
    return true;
  },
};
export type Options = typeof defaultOptions;

export default function transformer(
  program: ts.Program,
  options: Partial<Options> = defaultOptions,
): ts.TransformerFactory<ts.SourceFile> {
  options = {
    ...defaultOptions,
    ...options,
  };
  if (!program) {
    throw new Error('No ts.Program was passed to the transformer factory');
  }
  return (context: ts.TransformationContext) => (file: ts.SourceFile) =>
    visitSourceFile(file, program, context, options as Options);
}

function visitSourceFile(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options: Options,
): ts.SourceFile {
  const imports = sourceFile.statements.filter(s => ts.isImportDeclaration(s)) as ts.ImportDeclaration[];
  const hasReactImport = !!imports.find(s => (s.moduleSpecifier as ts.StringLiteral).text === 'react');

  if (hasReactImport && sourceFile.fileName.indexOf('.d.ts') === -1) {
    // Any import which imports a variable with leading uppercase char
    const potentialComponentImports = imports.filter(i => {
      return (
        (i.importClause &&
          i.importClause.name &&
          i.importClause.name.text[0] === i.importClause.name.text[0].toUpperCase()) ||
        (i.importClause &&
          i.importClause.namedBindings &&
          ts.isNamedImports(i.importClause.namedBindings) &&
          i.importClause.namedBindings.elements.some(e => e.name.text[0] === e.name.text[0].toUpperCase()))
      );
    });

    if (potentialComponentImports.length) {
      const transformedSourceFile = ts.visitEachChild(
        visitNode(sourceFile, potentialComponentImports, sourceFile, program, options),
        childNode => visitNodeAndChildren(childNode, potentialComponentImports, sourceFile, program, context, options),
        context,
      );
      return transformedSourceFile;
    }
  }
  return sourceFile;
}

function visitNodeAndChildren(
  node: ts.Node,
  potentialComponentImports: ts.ImportDeclaration[],
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options: Options,
): ts.Node | ts.Node[];
function visitNodeAndChildren(
  node: ts.Node,
  potentialComponentImports: ts.ImportDeclaration[],
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options: Options,
): ts.Node | ts.Node[] {
  const visitedNode = visitNode(node, potentialComponentImports, sourceFile, program, options);

  const visitedChildNode = ts.visitEachChild(
    visitedNode,
    childNode => visitNodeAndChildren(childNode, potentialComponentImports, sourceFile, program, context, options),
    context,
  );
  return visitedChildNode;
}

function getImportedReactComponents(importDecl: ts.ImportDeclaration, typeChecker: ts.TypeChecker, options: Options) {
  const componentNames: string[] = [];
  if (importDecl.importClause) {
    if (importDecl.importClause.name) {
      if (isComponentType('default', importDecl, typeChecker)) {
        componentNames.push(importDecl.importClause.name.text);
      }
    }

    if (
      !options.onlyRewriteDefaultExports &&
      importDecl.importClause.namedBindings &&
      ts.isNamedImports(importDecl.importClause.namedBindings)
    ) {
      for (const element of importDecl.importClause.namedBindings.elements) {
        if (isComponentType((element.propertyName || element.name).text, importDecl, typeChecker)) {
          componentNames.push(element.name.text);
        }
      }
    }
  }
  return componentNames;
}

function isComponentType(identifier: string, importDecl: ts.ImportDeclaration, typeChecker: ts.TypeChecker) {
  const importSymbol = typeChecker.getSymbolAtLocation(importDecl.moduleSpecifier);
  if (importSymbol) {
    const exports = typeChecker.getExportsOfModule(importSymbol);
    const exportedSymbol = exports.find(e => e.name === identifier);
    if (exportedSymbol && exportedSymbol.valueDeclaration) {
      if (ts.isClassDeclaration(exportedSymbol.valueDeclaration) && exportedSymbol.valueDeclaration.heritageClauses) {
        const maybeComponentClass = exportedSymbol.valueDeclaration;
        if (maybeComponentClass.heritageClauses) {
          const baseClass = maybeComponentClass.heritageClauses.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
          if (baseClass) {
            const extendsReactComponent = !!baseClass.types.find(
              t =>
                ts.isExpressionWithTypeArguments(t) &&
                ts.isPropertyAccessExpression(t.expression) &&
                ts.isIdentifier(t.expression.expression) &&
                t.expression.name.escapedText === 'Component' &&
                t.expression.expression.escapedText === 'React',
            );

            return extendsReactComponent;
          }
        }
      } else {
        const func = getFunction(exportedSymbol.valueDeclaration);

        if (func) {
          const type = typeChecker.getTypeOfSymbolAtLocation(exportedSymbol, exportedSymbol.valueDeclaration);
          const callSignatures = type.getCallSignatures();
          if (callSignatures.length) {
            const callSignature = callSignatures[0];
            const returnType = typeChecker.getReturnTypeOfSignature(callSignature).getSymbol();
            const returnParentType = returnType ? ((returnType as any).parent as ts.Symbol) : null;

            if (
              // props and context
              (func.parameters.length === 1 || func.parameters.length === 2) &&
              returnType &&
              returnType.escapedName === 'Element' &&
              returnParentType &&
              returnParentType.escapedName === 'JSX'
            ) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

function getFunction(decl: ts.Declaration) {
  if (ts.isFunctionDeclaration(decl)) {
    return decl;
  }

  if (ts.isExportAssignment(decl)) {
    if (ts.isFunctionExpression(decl.expression) || ts.isArrowFunction(decl.expression)) {
      return decl.expression;
    }
    return null;
  }

  if (ts.isVariableStatement(decl) || ts.isVariableDeclaration(decl)) {
    const declaration = ts.isVariableStatement(decl) ? decl.declarationList.declarations[0] : decl;
    if (
      declaration.initializer &&
      (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
    ) {
      return declaration.initializer;
    }
  }
  return null;
}

function visitNode(
  node: ts.Node,
  potentialComponentImports: ts.ImportDeclaration[],
  sourceFile: ts.SourceFile,
  program: ts.Program,
  options: Options,
): any /* TODO */ {
  if (ts.isImportDeclaration(node) && potentialComponentImports.indexOf(node) !== -1 && node.importClause) {
    if (!options.shouldRewrite((node.moduleSpecifier as ts.StringLiteral).text, sourceFile.fileName)) {
      return node;
    }

    const defaultImportName = node.importClause.name ? node.importClause.name.escapedText.toString() : undefined;
    const componentNames = getImportedReactComponents(node, program.getTypeChecker(), options);
    if (componentNames.length) {
      const defaultName =
        defaultImportName && componentNames.indexOf(defaultImportName) !== -1 ? undefined : defaultImportName;

      const additionalStatements: ts.Statement[] = componentNames.map(c => {
        const importCall = ts.createCall(
          { kind: ts.SyntaxKind.ImportKeyword, flags: ts.NodeFlags.None } as ts.ImportExpression,
          undefined,
          [node.moduleSpecifier as ts.StringLiteral],
        );

        let arrowBody: ts.CallExpression = importCall;
        if (defaultImportName !== c) {
          const element = (node.importClause!.namedBindings as ts.NamedImports).elements.find(
            e => e.name.escapedText == c,
          );
          if (element) {
            arrowBody = ts.createCall(ts.createPropertyAccess(importCall, 'then'), undefined, [
              ts.createArrowFunction(
                undefined,
                undefined,
                [ts.createParameter(undefined, undefined, undefined, 'm', undefined, undefined, undefined)],
                undefined,
                undefined,
                ts.createParen(
                  ts.createObjectLiteral([
                    ts.createPropertyAssignment(
                      'default',
                      ts.createPropertyAccess(
                        ts.createIdentifier('m'),
                        (element.propertyName || element.name).escapedText.toString(),
                      ),
                    ),
                  ]),
                ),
              ),
            ]);
          }
        }

        return ts.createVariableStatement(
          undefined,
          ts.createVariableDeclarationList(
            [
              ts.createVariableDeclaration(
                c,
                undefined,
                ts.createCall(options.createComponentWrapperExpression(ts), undefined, [
                  ts.createArrowFunction(undefined, undefined, [], undefined, undefined, arrowBody),
                ]),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        );
      });

      const additionalImport = options.createImportDeclaration(ts, sourceFile.fileName);
      if (additionalImport) {
        additionalStatements.unshift(additionalImport);
      }

      const importedNames =
        (node.importClause!.name && componentNames.indexOf(node.importClause!.name!.escapedText.toString()) !== -1
          ? 1
          : 0) +
        (node.importClause!.namedBindings ? (node.importClause!.namedBindings as ts.NamedImports).elements.length : 0);

      if (importedNames === componentNames.length) {
        return additionalStatements;
      } else if (!options.onlyRewriteIfImportCanBeRemoved) {
        return [
          ...additionalStatements,
          ts.createImportDeclaration(
            node.decorators,
            node.modifiers,
            ts.createImportClause(
              defaultName ? ts.createIdentifier(defaultName) : undefined,
              node.importClause!.namedBindings
                ? removeImportNames(node.importClause!.namedBindings as ts.NamedImports, componentNames)
                : undefined,
            ),
            node.moduleSpecifier,
          ),
        ];
      }
    }
  }
  return node;
}

function removeImportNames(namedBindings: ts.NamedImports, importNamesToRemove: string[]): ts.NamedImports {
  return {
    ...namedBindings,
    elements: (namedBindings.elements.filter(
      e => importNamesToRemove.indexOf((e.propertyName || e.name).text) === -1,
    ) as any) as ts.NodeArray<ts.ImportSpecifier>,
  };
}
