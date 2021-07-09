import { Registry, StackElement, parseRawGrammar, } from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Utility to read a file as a promise
 */
function readFile(path) {
    return new Promise<Buffer>((resolve, reject) => {
        fs.readFile(path, (error, data) => error ? reject(error) : resolve(data));
    })
}

// The path is different whether we are running tests from `out/test/**/*.js` or `test/**/*.ts`
var onigPath = fs.existsSync(path.join(__dirname, '../../node_modules/vscode-oniguruma/release/onig.wasm'))
    ? path.join(__dirname, '../../node_modules/vscode-oniguruma/release/onig.wasm')
    : path.join(__dirname, '../../../node_modules/vscode-oniguruma/release/onig.wasm');
const wasmBin = fs.readFileSync(onigPath).buffer;
const vscodeOnigurumaLib = oniguruma.loadWASM(wasmBin).then(() => {
    return {
        createOnigScanner(patterns) { return new oniguruma.OnigScanner(patterns); },
        createOnigString(s) { return new oniguruma.OnigString(s); }
    };
});

const registry = new Registry({
    onigLib: vscodeOnigurumaLib,
    loadGrammar: async (scopeName) => {
        if (scopeName === 'source.mana') {
            return readFile('./grammars/mana.tmLanguage')
                .then(data => parseRawGrammar(data.toString()));
        }
        console.log(`Unknown scope name: ${scopeName}`);
        return null;
    }
});

const excludedTypes = ['source.mana', 'meta.interpolation.mana', 'meta.preprocessor.mana', 'meta.tag.mana', 'meta.type.parameters.mana']

export async function tokenize(input: string | Input, excludeTypes: boolean = true): Promise<Token[]> {
    if (typeof input === "string") {
        input = Input.FromText(input);
    }

    let tokens: Token[] = [];
    let previousStack: StackElement = null;
    const grammar = await registry.loadGrammar('source.mana');

    for (let lineIndex = 0; lineIndex < input.lines.length; lineIndex++) {
        const line = input.lines[lineIndex];

        let lineResult = grammar.tokenizeLine(line, previousStack);
        previousStack = lineResult.ruleStack;

        if (lineIndex < input.span.startLine || lineIndex > input.span.endLine) {
            continue;
        }

        for (const token of lineResult.tokens) {
            if ((lineIndex === input.span.startLine && token.startIndex < input.span.startIndex) ||
                (lineIndex === input.span.endLine && token.endIndex > input.span.endIndex)) {
                continue;
            }

            const text = line.substring(token.startIndex, token.endIndex);
            const type = token.scopes[token.scopes.length - 1];

            if (excludeTypes === false || excludedTypes.indexOf(type) < 0) {
                tokens.push(createToken(text, type));
            }
        }
    }

    return tokens;
}

interface Span {
    startLine: number;
    startIndex: number;
    endLine: number;
    endIndex: number;
}

export class Input {
    private constructor(
        public lines: string[],
        public span: Span) { }

    public static FromText(text: string) {
        // ensure consistent line-endings irrelevant of OS
        text = text.replace('\r\n', '\n');
        let lines = text.split('\n');

        return new Input(lines, { startLine: 0, startIndex: 0, endLine: lines.length - 1, endIndex: lines[lines.length - 1].length });
    }

    public static InEnum(input: string) {
        let text = `
enum TestEnum {
    ${input}
}`;

        // ensure consistent line-endings irrelevant of OS
        text = text.replace('\r\n', '\n');
        let lines = text.split('\n');

        return new Input(lines, { startLine: 2, startIndex: 4, endLine: lines.length - 1, endIndex: 0 });
    }

    public static InClass(input: string) {
        let text = `
class TestClass {
    ${input}
}`;

        // ensure consistent line-endings irrelevant of OS
        text = text.replace('\r\n', '\n');
        let lines = text.split('\n');

        return new Input(lines, { startLine: 2, startIndex: 4, endLine: lines.length - 1, endIndex: 0 });
    }

    public static InInterface(input: string) {
        let text = `
interface TestInterface {
    ${input}
}`;

        // ensure consistent line-endings irrelevant of OS
        text = text.replace('\r\n', '\n');
        let lines = text.split('\n');

        return new Input(lines, { startLine: 2, startIndex: 4, endLine: lines.length - 1, endIndex: 0 });
    }

    public static InMethod(input: string) {
        let text = `
class TestClass {
    void TestMethod() {
        ${input}
    }
}`;

        // ensure consistent line-endings irrelevant of OS
        text = text.replace('\r\n', '\n');
        let lines = text.split('\n');

        return new Input(lines, { startLine: 3, startIndex: 8, endLine: lines.length - 2, endIndex: 0 });
    }

    public static InNamespace(input: string) {
        let text = `
namespace TestNamespace {
    ${input}
}`;

        // ensure consistent line-endings irrelevant of OS
        text = text.replace('\r\n', '\n');
        let lines = text.split('\n');

        return new Input(lines, { startLine: 2, startIndex: 4, endLine: lines.length - 1, endIndex: 0 });
    }

    public static InStruct(input: string) {
        let text = `
struct TestStruct {
    ${input}
}`;

        // ensure consistent line-endings irrelevant of OS
        text = text.replace('\r\n', '\n');
        let lines = text.split('\n');

        return new Input(lines, { startLine: 2, startIndex: 4, endLine: lines.length - 1, endIndex: 0 });
    }
}

export interface Token {
    text: string;
    type: string;
}

function createToken(text: string, type: string) {
    return { text, type };
}

export namespace Token {
    export namespace Comment {
        export const LeadingWhitespace = (text: string) => createToken(text, 'punctuation.whitespace.comment.leading.mana');

        export namespace MultiLine {
            export const End = createToken('*/', 'punctuation.definition.comment.mana');
            export const Start = createToken('/*', 'punctuation.definition.comment.mana');

            export const Text = (text: string) => createToken(text, 'comment.block.mana');
        }

        export namespace SingleLine {
            export const Start = createToken('//', 'punctuation.definition.comment.mana');

            export const Text = (text: string) => createToken(text, 'comment.line.double-slash.mana');
        }
    }

    export namespace Identifiers {
        export const AliasName = (text: string) => createToken(text, 'entity.name.type.alias.mana');
        export const ClassName = (text: string) => createToken(text, 'entity.name.type.class.mana');
        export const DelegateName = (text: string) => createToken(text, 'entity.name.type.delegate.mana');
        export const EnumMemberName = (text: string) => createToken(text, 'entity.name.variable.enum-member.mana');
        export const EnumName = (text: string) => createToken(text, 'entity.name.type.enum.mana');
        export const EventName = (text: string) => createToken(text, 'entity.name.variable.event.mana');
        export const FieldName = (text: string) => createToken(text, 'entity.name.variable.field.mana');
        export const InterfaceName = (text: string) => createToken(text, 'entity.name.type.interface.mana');
        export const LabelName = (text: string) => createToken(text, 'entity.name.label.mana');
        export const LocalName = (text: string) => createToken(text, 'entity.name.variable.local.mana');
        export const MethodName = (text: string) => createToken(text, 'entity.name.function.mana');
        export const NamespaceName = (text: string) => createToken(text, 'entity.name.type.namespace.mana');
        export const ParameterName = (text: string) => createToken(text, 'entity.name.variable.parameter.mana');
        export const PreprocessorSymbol = (text: string) => createToken(text, 'entity.name.variable.preprocessor.symbol.mana');
        export const PropertyName = (text: string) => createToken(text, 'entity.name.variable.property.mana');
        export const RangeVariableName = (text: string) => createToken(text, 'entity.name.variable.range-variable.mana');
        export const RecordName = (text: string) => createToken(text, 'entity.name.type.record.mana');
        export const StructName = (text: string) => createToken(text, 'entity.name.type.struct.mana');
        export const TupleElementName = (text: string) => createToken(text, 'entity.name.variable.tuple-element.mana');
        export const TypeParameterName = (text: string) => createToken(text, 'entity.name.type.type-parameter.mana');
    }

    export namespace Keywords {
        export namespace Control {
            export const Break = createToken('break', 'keyword.control.flow.break.mana');
            export const Case = createToken('case', 'keyword.control.case.mana');
            export const Catch = createToken('catch', 'keyword.control.try.catch.mana');
            export const Continue = createToken('continue', 'keyword.control.flow.continue.mana');
            export const Default = createToken('default', 'keyword.control.default.mana');
            export const Do = createToken('do', 'keyword.control.loop.do.mana');
            export const Else = createToken('else', 'keyword.control.conditional.else.mana');
            export const Finally = createToken('finally', 'keyword.control.try.finally.mana');
            export const For = createToken('for', 'keyword.control.loop.for.mana');
            export const ForEach = createToken('foreach', 'keyword.control.loop.foreach.mana');
            export const Goto = createToken('goto', 'keyword.control.goto.mana');
            export const If = createToken('if', 'keyword.control.conditional.if.mana');
            export const In = createToken('in', 'keyword.control.loop.in.mana');
            export const Return = createToken('return', 'keyword.control.flow.return.mana');
            export const Switch = createToken('switch', 'keyword.control.switch.mana');
            export const Throw = createToken('throw', 'keyword.control.flow.throw.mana');
            export const Try = createToken('try', 'keyword.control.try.mana');
            export const When = createToken('when', 'keyword.control.try.when.mana');
            export const While = createToken('while', 'keyword.control.loop.while.mana');
            export const Yield = createToken('yield', 'keyword.control.flow.yield.mana');
        }

        export namespace Modifiers {
            export const Abstract = createToken('abstract', 'storage.modifier.mana');
            export const Async = createToken('async', 'storage.modifier.mana');
            export const Const = createToken('const', 'storage.modifier.mana');
            export const Extern = createToken('extern', 'storage.modifier.mana');
            export const In = createToken('in', 'storage.modifier.mana');
            export const Internal = createToken('internal', 'storage.modifier.mana');
            export const New = createToken('new', 'storage.modifier.mana');
            export const Out = createToken('out', 'storage.modifier.mana');
            export const Override = createToken('override', 'storage.modifier.mana');
            export const Params = createToken('params', 'storage.modifier.mana');
            export const Partial = createToken('partial', 'storage.modifier.mana');
            export const Private = createToken('private', 'storage.modifier.mana');
            export const Protected = createToken('protected', 'storage.modifier.mana');
            export const Public = createToken('public', 'storage.modifier.mana');
            export const ReadOnly = createToken('readonly', 'storage.modifier.mana');
            export const Ref = createToken('ref', 'storage.modifier.mana');
            export const Sealed = createToken('sealed', 'storage.modifier.mana');
            export const Static = createToken('static', 'storage.modifier.mana');
            export const This = createToken('this', 'storage.modifier.mana');
            export const Unsafe = createToken('unsafe', 'storage.modifier.mana');
            export const Virtual = createToken('virtual', 'storage.modifier.mana');
        }

        export namespace Preprocessor {
            export const Checksum = createToken('checksum', 'keyword.preprocessor.checksum.mana');
            export const Default = createToken('default', 'keyword.preprocessor.default.mana');
            export const Define = createToken('define', 'keyword.preprocessor.define.mana');
            export const Disable = createToken('disable', 'keyword.preprocessor.disable.mana');
            export const ElIf = createToken('elif', 'keyword.preprocessor.elif.mana');
            export const Else = createToken('else', 'keyword.preprocessor.else.mana');
            export const EndIf = createToken('endif', 'keyword.preprocessor.endif.mana');
            export const EndRegion = createToken('endregion', 'keyword.preprocessor.endregion.mana');
            export const Error = createToken('error', 'keyword.preprocessor.error.mana');
            export const Hidden = createToken('hidden', 'keyword.preprocessor.hidden.mana');
            export const If = createToken('if', 'keyword.preprocessor.if.mana');
            export const Line = createToken('line', 'keyword.preprocessor.line.mana');
            export const Pragma = createToken('pragma', 'keyword.preprocessor.pragma.mana');
            export const Region = createToken('region', 'keyword.preprocessor.region.mana');
            export const Restore = createToken('restore', 'keyword.preprocessor.restore.mana');
            export const Undef = createToken('undef', 'keyword.preprocessor.undef.mana');
            export const Warning = createToken('warning', 'keyword.preprocessor.warning.mana');
            export const R = createToken('r', 'keyword.preprocessor.r.mana');
            export const Load = createToken('load', 'keyword.preprocessor.load.mana');
        }

        export namespace Queries {
            export const Ascending = createToken('ascending', 'keyword.query.ascending.mana');
            export const By = createToken('by', 'keyword.query.by.mana');
            export const Descending = createToken('descending', 'keyword.query.descending.mana');
            export const Equals = createToken('equals', 'keyword.query.equals.mana');
            export const From = createToken('from', 'keyword.query.from.mana');
            export const Group = createToken('group', 'keyword.query.group.mana');
            export const In = createToken('in', 'keyword.query.in.mana');
            export const Into = createToken('into', 'keyword.query.into.mana');
            export const Join = createToken('join', 'keyword.query.join.mana');
            export const Let = createToken('let', 'keyword.query.let.mana');
            export const On = createToken('on', 'keyword.query.on.mana');
            export const OrderBy = createToken('orderby', 'keyword.query.orderby.mana');
            export const Select = createToken('select', 'keyword.query.select.mana');
            export const Where = createToken('where', 'keyword.query.where.mana');
        }

        export const Add = createToken('add', 'keyword.other.add.mana');
        export const Alias = createToken('alias', 'keyword.other.alias.mana');
        export const AttributeSpecifier = (text: string) => createToken(text, 'keyword.other.attribute-specifier.mana');
        export const Await = createToken('await', 'keyword.other.await.mana');
        export const As = createToken('as', 'keyword.other.as.mana');
        export const Base = createToken('base', 'keyword.other.base.mana');
        export const Checked = createToken('checked', 'keyword.other.checked.mana');
        export const Class = createToken('class', 'keyword.other.class.mana');
        export const Default = createToken('default', 'keyword.other.default.mana');
        export const Delegate = createToken('delegate', 'keyword.other.delegate.mana');
        export const Enum = createToken('enum', 'keyword.other.enum.mana');
        export const Event = createToken('event', 'keyword.other.event.mana');
        export const Explicit = createToken('explicit', 'keyword.other.explicit.mana');
        export const Extern = createToken('extern', 'keyword.other.extern.mana');
        export const Get = createToken('get', 'keyword.other.get.mana');
        export const Implicit = createToken('implicit', 'keyword.other.implicit.mana');
        export const Init = createToken('init', 'keyword.other.init.mana');
        export const Interface = createToken('interface', 'keyword.other.interface.mana');
        export const Is = createToken('is', 'keyword.other.is.mana');
        export const Lock = createToken('lock', 'keyword.other.lock.mana');
        export const NameOf = createToken('nameof', 'keyword.other.nameof.mana');
        export const Namespace = createToken('namespace', 'keyword.other.namespace.mana');
        export const New = createToken('new', 'keyword.other.new.mana');
        export const Stackalloc = createToken('stackalloc', 'keyword.other.new.mana');
        export const Operator = createToken('operator', 'keyword.other.operator-decl.mana');
        export const Record = createToken('record', 'keyword.other.record.mana');
        export const Remove = createToken('remove', 'keyword.other.remove.mana');
        export const Set = createToken('set', 'keyword.other.set.mana');
        export const Static = createToken('static', 'keyword.other.static.mana');
        export const Struct = createToken('struct', 'keyword.other.struct.mana');
        export const This = createToken('this', 'keyword.other.this.mana');
        export const TypeOf = createToken('typeof', 'keyword.other.typeof.mana');
        export const Unchecked = createToken('unchecked', 'keyword.other.unchecked.mana');
        export const Using = createToken('using', 'keyword.other.using.mana');
        export const Var = createToken('var', 'keyword.other.var.mana');
        export const Where = createToken('where', 'keyword.other.where.mana');
    }

    export namespace Literals {
        export namespace Boolean {
            export const False = createToken('false', 'constant.language.boolean.false.mana');
            export const True = createToken('true', 'constant.language.boolean.true.mana');
        }

        export const Null = createToken('null', 'constant.language.null.mana');

        export namespace Numeric {
            export const Binary = (text: string) => createToken(text, 'constant.numeric.binary.mana');
            export const Decimal = (text: string) => createToken(text, 'constant.numeric.decimal.mana');
            export const Hexadecimal = (text: string) => createToken(text, 'constant.numeric.hex.mana');
            export const Invalid = (text: string) => createToken(text, 'invalid.illegal.constant.numeric.mana')
            
            export namespace Other
            {
                export const Exponent = (text: string) => createToken(text, 'constant.numeric.other.exponent.mana');
                export const Suffix = (text: string) => createToken(text, 'constant.numeric.other.suffix.mana');
                
                export namespace Preffix
                {
                    export const Binary = (text: string) => createToken(text, 'constant.numeric.other.preffix.binary.mana');
                    export const Hexadecimal = (text: string) => createToken(text, 'constant.numeric.other.preffix.hex.mana');
                }

                export namespace Separator
                {
                    export const Decimals = createToken('.', 'constant.numeric.other.separator.decimals.mana');
                    export const Thousands = createToken('_', 'constant.numeric.other.separator.thousands.mana');
                }
            }
        }

        export const Char = (text: string) => createToken(text, 'string.quoted.single.mana');
        export const CharacterEscape = (text: string) => createToken(text, 'constant.character.escape.mana');
        export const String = (text: string) => createToken(text, 'string.quoted.double.mana');
    }

    export namespace Operators {
        export namespace Arithmetic {
            export const Addition = createToken('+', 'keyword.operator.arithmetic.mana');
            export const Division = createToken('/', 'keyword.operator.arithmetic.mana');
            export const Multiplication = createToken('*', 'keyword.operator.arithmetic.mana');
            export const Remainder = createToken('%', 'keyword.operator.arithmetic.mana');
            export const Subtraction = createToken('-', 'keyword.operator.arithmetic.mana');
        }

        export namespace Bitwise {
            export const And = createToken('&', 'keyword.operator.bitwise.mana');
            export const BitwiseComplement = createToken('~', 'keyword.operator.bitwise.mana');
            export const ExclusiveOr = createToken('^', 'keyword.operator.bitwise.mana');
            export const Or = createToken('|', 'keyword.operator.bitwise.mana');
            export const ShiftLeft = createToken('<<', 'keyword.operator.bitwise.shift.mana');
            export const ShiftRight = createToken('>>', 'keyword.operator.bitwise.shift.mana');
        }

        export namespace CompoundAssignment {
            export namespace Arithmetic {
                export const Addition = createToken('+=', 'keyword.operator.assignment.compound.mana');
                export const Division = createToken('/=', 'keyword.operator.assignment.compound.mana');
                export const Multiplication = createToken('*=', 'keyword.operator.assignment.compound.mana');
                export const Remainder = createToken('%=', 'keyword.operator.assignment.compound.mana');
                export const Subtraction = createToken('-=', 'keyword.operator.assignment.compound.mana');
            }

            export namespace Bitwise {
                export const And = createToken('&=', 'keyword.operator.assignment.compound.bitwise.mana');
                export const ExclusiveOr = createToken('^=', 'keyword.operator.assignment.compound.bitwise.mana');
                export const Or = createToken('|=', 'keyword.operator.assignment.compound.bitwise.mana');
                export const ShiftLeft = createToken('<<=', 'keyword.operator.assignment.compound.bitwise.mana');
                export const ShiftRight = createToken('>>=', 'keyword.operator.assignment.compound.bitwise.mana');
            }

            export const NullCoalescing = createToken('??=', 'keyword.operator.assignment.compound.mana');
        }

        export namespace Conditional {
            export const QuestionMark = createToken('?', 'keyword.operator.conditional.question-mark.mana');
            export const Colon = createToken(':', 'keyword.operator.conditional.colon.mana');
        }

        export namespace Logical {
            export const And = createToken('&&', 'keyword.operator.logical.mana');
            export const Not = createToken('!', 'keyword.operator.logical.mana');
            export const Or = createToken('||', 'keyword.operator.logical.mana');
        }

        export namespace Relational {
            export const Equals = createToken('==', 'keyword.operator.comparison.mana');
            export const NotEqual = createToken('!=', 'keyword.operator.comparison.mana');

            export const LessThan = createToken('<', 'keyword.operator.relational.mana');
            export const LessThanOrEqual = createToken('<=', 'keyword.operator.relational.mana');
            export const GreaterThan = createToken('>', 'keyword.operator.relational.mana');
            export const GreaterThanOrEqual = createToken('>=', 'keyword.operator.relational.mana');
        }

        export const Arrow = createToken('=>', 'keyword.operator.arrow.mana');
        export const Assignment = createToken('=', 'keyword.operator.assignment.mana');
        export const Decrement = createToken('--', 'keyword.operator.decrement.mana');
        export const Increment = createToken('++', 'keyword.operator.increment.mana');
        export const NullCoalescing = createToken('??', 'keyword.operator.null-coalescing.mana');
        export const NullConditional = createToken('?', 'keyword.operator.null-conditional.mana');
    }

    export namespace PrimitiveType {
        export const Bool = createToken('bool', 'keyword.type.mana');
        export const Byte = createToken('byte', 'keyword.type.mana');
        export const Char = createToken('char', 'keyword.type.mana');
        export const Decimal = createToken('decimal', 'keyword.type.mana');
        export const Double = createToken('double', 'keyword.type.mana');
        export const Float = createToken('float', 'keyword.type.mana');
        export const Half = createToken('half', 'keyword.type.mana');
        export const Int32 = createToken('int32', 'keyword.type.mana');
        export const Int64 = createToken('int64', 'keyword.type.mana');
        export const Object = createToken('object', 'keyword.type.mana');
        export const SByte = createToken('sbyte', 'keyword.type.mana');
        export const Short = createToken('short', 'keyword.type.mana');
        export const String = createToken('string', 'keyword.type.mana');
        export const UInt32 = createToken('uint32', 'keyword.type.mana');
        export const UInt64 = createToken('uint64', 'keyword.type.mana');
        export const UShort = createToken('ushort', 'keyword.type.mana');
        export const Void = createToken('void', 'keyword.type.mana');
    }

    export namespace Punctuation {
        export namespace Char {
            export const Begin = createToken('\'', 'punctuation.definition.char.begin.mana');
            export const End = createToken('\'', 'punctuation.definition.char.end.mana');
        }

        export namespace Interpolation {
            export const Begin = createToken('{', 'punctuation.definition.interpolation.begin.mana');
            export const End = createToken('}', 'punctuation.definition.interpolation.end.mana');
        }

        export namespace InterpolatedString {
            export const Begin = createToken('$"', 'punctuation.definition.string.begin.mana');
            export const End = createToken('"', 'punctuation.definition.string.end.mana');
            export const VerbatimBegin = createToken('$@"', 'punctuation.definition.string.begin.mana');
            export const VerbatimBeginReverse = createToken('@$"', 'punctuation.definition.string.begin.mana');
        }

        export namespace String {
            export const Begin = createToken('"', 'punctuation.definition.string.begin.mana');
            export const End = createToken('"', 'punctuation.definition.string.end.mana');
            export const VerbatimBegin = createToken('@"', 'punctuation.definition.string.begin.mana');
        }

        export namespace TypeParameters {
            export const Begin = createToken('<', 'punctuation.definition.typeparameters.begin.mana');
            export const End = createToken('>', 'punctuation.definition.typeparameters.end.mana');
        }

        export const Accessor = createToken('.', 'punctuation.accessor.mana');
        export const CloseBrace = createToken('}', 'punctuation.curlybrace.close.mana');
        export const CloseBracket = createToken(']', 'punctuation.squarebracket.close.mana');
        export const CloseParen = createToken(')', 'punctuation.parenthesis.close.mana');
        export const Colon = createToken(':', 'punctuation.separator.colon.mana');
        export const ColonColon = createToken('::', 'punctuation.separator.coloncolon.mana');
        export const Comma = createToken(',', 'punctuation.separator.comma.mana');
        export const Hash = createToken('#', 'punctuation.separator.hash.mana')
        export const OpenBrace = createToken('{', 'punctuation.curlybrace.open.mana');
        export const OpenBracket = createToken('[', 'punctuation.squarebracket.open.mana');
        export const OpenParen = createToken('(', 'punctuation.parenthesis.open.mana');
        export const QuestionMark = createToken('?', 'punctuation.separator.question-mark.mana');
        export const Semicolon = createToken(';', 'punctuation.terminator.statement.mana');
        export const Tilde = createToken('~', 'punctuation.tilde.mana');
    }

    export namespace Variables {
        export const Alias = (text: string) => createToken(text, 'variable.other.alias.mana');
        export const Object = (text: string) => createToken(text, 'variable.other.object.mana');
        export const Property = (text: string) => createToken(text, 'variable.other.object.property.mana');
        export const ReadWrite = (text: string) => createToken(text, 'variable.other.readwrite.mana');
    }

    export namespace XmlDocComments {
        export namespace Attribute {
            export const Name = (text: string) => createToken(text, 'entity.other.attribute-name.localname.mana');
        }

        export namespace CData {
            export const Begin = createToken('<![CDATA[', 'punctuation.definition.string.begin.mana');
            export const End = createToken(']]>', 'punctuation.definition.string.end.mana');
            export const Text = (text: string) => createToken(text, 'string.unquoted.cdata.mana');
        }

        export namespace CharacterEntity {
            export const Begin = createToken('&', 'punctuation.definition.constant.mana');
            export const End = createToken(';', 'punctuation.definition.constant.mana');
            export const Text = (text: string) => createToken(text, 'constant.character.entity.mana');
        }

        export namespace Comment {
            export const Begin = createToken('<!--', 'punctuation.definition.comment.mana')
            export const End = createToken('-->', 'punctuation.definition.comment.mana')
            export const Text = (text: string) => createToken(text, 'comment.block.mana')
        }

        export namespace Tag {
            // punctuation
            export const StartTagBegin = createToken('<', 'punctuation.definition.tag.mana');
            export const StartTagEnd = createToken('>', 'punctuation.definition.tag.mana');
            export const EndTagBegin = createToken('</', 'punctuation.definition.tag.mana');
            export const EndTagEnd = createToken('>', 'punctuation.definition.tag.mana');
            export const EmptyTagBegin = createToken('<', 'punctuation.definition.tag.mana');
            export const EmptyTagEnd = createToken('/>', 'punctuation.definition.tag.mana');

            export const Name = (text: string) => createToken(text, 'entity.name.tag.localname.mana');
        }

        export namespace String {
            export namespace DoubleQuoted {
                export const Begin = createToken('"', 'punctuation.definition.string.begin.mana');
                export const End = createToken('"', 'punctuation.definition.string.end.mana');
                export const Text = (text: string) => createToken(text, 'string.quoted.double.mana');
            }

            export namespace SingleQuoted {
                export const Begin = createToken('\'', 'punctuation.definition.string.begin.mana');
                export const End = createToken('\'', 'punctuation.definition.string.end.mana');
                export const Text = (text: string) => createToken(text, 'string.quoted.single.mana');
            }
        }

        export const Begin = createToken('///', 'punctuation.definition.comment.mana');
        export const Colon = createToken(':', 'punctuation.separator.colon.mana');
        export const Equals = createToken('=', 'punctuation.separator.equals.mana');
        export const Text = (text: string) => createToken(text, 'comment.block.documentation.mana');
    }

    export const IllegalNewLine = (text: string) => createToken(text, 'invalid.illegal.newline.mana');
    export const PreprocessorMessage = (text: string) => createToken(text, 'string.unquoted.preprocessor.message.mana');
    export const Type = (text: string) => createToken(text, 'storage.type.mana');
}