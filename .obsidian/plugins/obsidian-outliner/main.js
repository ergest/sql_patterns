'use strict';

var obsidian = require('obsidian');
var view = require('@codemirror/view');
var state = require('@codemirror/state');
var fold = require('@codemirror/fold');
var language = require('@codemirror/language');

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function recalculateNumericBullets(root) {
    function visit(parent) {
        let index = 1;
        for (const child of parent.getChildren()) {
            if (/\d+\./.test(child.getBullet())) {
                child.replateBullet(`${index++}.`);
            }
            visit(child);
        }
    }
    visit(root);
}

class DeleteAndMergeWithPreviousLineOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const list = root.getListUnderCursor();
        const cursor = root.getCursor();
        const lines = list.getLinesInfo();
        const lineNo = lines.findIndex((l) => cursor.ch === l.from.ch && cursor.line === l.from.line);
        if (lineNo === 0) {
            this.mergeWithPreviousItem(root, cursor, list);
        }
        else if (lineNo > 0) {
            this.mergeNotes(root, cursor, list, lines, lineNo);
        }
    }
    mergeNotes(root, cursor, list, lines, lineNo) {
        this.stopPropagation = true;
        this.updated = true;
        const prevLineNo = lineNo - 1;
        root.replaceCursor({
            line: cursor.line - 1,
            ch: lines[prevLineNo].text.length + lines[prevLineNo].from.ch,
        });
        lines[prevLineNo].text += lines[lineNo].text;
        lines.splice(lineNo, 1);
        list.replaceLines(lines.map((l) => l.text));
    }
    mergeWithPreviousItem(root, cursor, list) {
        if (root.getChildren()[0] === list && list.getChildren().length === 0) {
            return;
        }
        this.stopPropagation = true;
        const prev = root.getListUnderLine(cursor.line - 1);
        if (!prev) {
            return;
        }
        const bothAreEmpty = prev.isEmpty() && list.isEmpty();
        const prevIsEmptyAndSameLevel = prev.isEmpty() && !list.isEmpty() && prev.getLevel() == list.getLevel();
        const listIsEmptyAndPrevIsParent = list.isEmpty() && prev.getLevel() == list.getLevel() - 1;
        if (bothAreEmpty || prevIsEmptyAndSameLevel || listIsEmptyAndPrevIsParent) {
            this.updated = true;
            const parent = list.getParent();
            const prevEnd = prev.getLastLineContentEnd();
            if (!prev.getNotesIndent() && list.getNotesIndent()) {
                prev.setNotesIndent(prev.getFirstLineIndent() +
                    list.getNotesIndent().slice(list.getFirstLineIndent().length));
            }
            const oldLines = prev.getLines();
            const newLines = list.getLines();
            oldLines[oldLines.length - 1] += newLines[0];
            const resultLines = oldLines.concat(newLines.slice(1));
            prev.replaceLines(resultLines);
            parent.removeChild(list);
            for (const c of list.getChildren()) {
                list.removeChild(c);
                prev.addAfterAll(c);
            }
            root.replaceCursor(prevEnd);
            recalculateNumericBullets(root);
        }
    }
}

class DeleteAndMergeWithNextLineOperation {
    constructor(root) {
        this.root = root;
        this.deleteAndMergeWithPrevious =
            new DeleteAndMergeWithPreviousLineOperation(root);
    }
    shouldStopPropagation() {
        return this.deleteAndMergeWithPrevious.shouldStopPropagation();
    }
    shouldUpdate() {
        return this.deleteAndMergeWithPrevious.shouldUpdate();
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const list = root.getListUnderCursor();
        const cursor = root.getCursor();
        const lines = list.getLinesInfo();
        const lineNo = lines.findIndex((l) => cursor.ch === l.to.ch && cursor.line === l.to.line);
        if (lineNo === lines.length - 1) {
            const nextLine = lines[lineNo].to.line + 1;
            const nextList = root.getListUnderLine(nextLine);
            if (!nextList) {
                return;
            }
            root.replaceCursor(nextList.getFirstLineContentStart());
            this.deleteAndMergeWithPrevious.perform();
        }
        else if (lineNo >= 0) {
            root.replaceCursor(lines[lineNo + 1].from);
            this.deleteAndMergeWithPrevious.perform();
        }
    }
}

class DeleteTillLineStartOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        this.updated = true;
        const cursor = root.getCursor();
        const list = root.getListUnderCursor();
        const lines = list.getLinesInfo();
        const lineNo = lines.findIndex((l) => l.from.line === cursor.line);
        lines[lineNo].text = lines[lineNo].text.slice(cursor.ch - lines[lineNo].from.ch);
        list.replaceLines(lines.map((l) => l.text));
        root.replaceCursor(lines[lineNo].from);
    }
}

class DeleteShouldIgnoreBulletsFeature {
    constructor(plugin, settings, ime, obsidian, performOperation) {
        this.plugin = plugin;
        this.settings = settings;
        this.ime = ime;
        this.obsidian = obsidian;
        this.performOperation = performOperation;
        this.check = () => {
            return this.settings.stickCursor && !this.ime.isIMEOpened();
        };
        this.deleteAndMergeWithPreviousLine = (editor) => {
            return this.performOperation.performOperation((root) => new DeleteAndMergeWithPreviousLineOperation(root), editor);
        };
        this.deleteTillLineStart = (editor) => {
            return this.performOperation.performOperation((root) => new DeleteTillLineStartOperation(root), editor);
        };
        this.deleteAndMergeWithNextLine = (editor) => {
            return this.performOperation.performOperation((root) => new DeleteAndMergeWithNextLineOperation(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    key: "Backspace",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.deleteAndMergeWithPreviousLine,
                    }),
                },
                {
                    key: "Delete",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.deleteAndMergeWithNextLine,
                    }),
                },
                {
                    mac: "m-Backspace",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.deleteTillLineStart,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class EnsureCursorInListContentOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const cursor = root.getCursor();
        const list = root.getListUnderCursor();
        const contentStart = list.getFirstLineContentStart();
        const linePrefix = contentStart.line === cursor.line
            ? contentStart.ch
            : list.getNotesIndent().length;
        if (cursor.ch < linePrefix) {
            this.updated = true;
            root.replaceCursor({
                line: cursor.line,
                ch: linePrefix,
            });
        }
    }
}

class EnsureCursorIsInUnfoldedLineOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const cursor = root.getCursor();
        const list = root.getListUnderCursor();
        if (!list.isFolded()) {
            return;
        }
        let foldRoot = list;
        while (!foldRoot.isFoldRoot()) {
            foldRoot = foldRoot.getParent();
        }
        const firstLineEnd = foldRoot.getLinesInfo()[0].to;
        if (cursor.line > firstLineEnd.line) {
            this.updated = true;
            root.replaceCursor(firstLineEnd);
        }
    }
}

class EnsureCursorInListContentFeature {
    constructor(plugin, settings, obsidian, performOperation) {
        this.plugin = plugin;
        this.settings = settings;
        this.obsidian = obsidian;
        this.performOperation = performOperation;
        this.transactionExtender = (tr) => {
            if (!this.settings.stickCursor || !tr.selection) {
                return null;
            }
            const editor = this.obsidian.getEditorFromState(tr.startState);
            setImmediate(() => {
                this.handleCursorActivity(editor);
            });
            return null;
        };
        this.handleCursorActivity = (editor) => {
            this.performOperation.performOperation((root) => new EnsureCursorIsInUnfoldedLineOperation(root), editor);
            this.performOperation.performOperation((root) => new EnsureCursorInListContentOperation(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(state.EditorState.transactionExtender.of(this.transactionExtender));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class MoveLeftOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const list = root.getListUnderCursor();
        const parent = list.getParent();
        const grandParent = parent.getParent();
        if (!grandParent) {
            return;
        }
        this.updated = true;
        const listStartLineBefore = root.getContentLinesRangeOf(list)[0];
        const indentRmFrom = parent.getFirstLineIndent().length;
        const indentRmTill = list.getFirstLineIndent().length;
        parent.removeChild(list);
        grandParent.addAfter(parent, list);
        list.unindentContent(indentRmFrom, indentRmTill);
        const listStartLineAfter = root.getContentLinesRangeOf(list)[0];
        const lineDiff = listStartLineAfter - listStartLineBefore;
        const chDiff = indentRmTill - indentRmFrom;
        const cursor = root.getCursor();
        root.replaceCursor({
            line: cursor.line + lineDiff,
            ch: cursor.ch - chDiff,
        });
        recalculateNumericBullets(root);
    }
}

function isEmptyLineOrEmptyCheckbox(line) {
    return line === "" || line === "[ ] ";
}

class OutdentIfLineIsEmptyOperation {
    constructor(root) {
        this.root = root;
        this.moveLeftOp = new MoveLeftOperation(root);
    }
    shouldStopPropagation() {
        return this.moveLeftOp.shouldStopPropagation();
    }
    shouldUpdate() {
        return this.moveLeftOp.shouldUpdate();
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const list = root.getListUnderCursor();
        const lines = list.getLines();
        if (lines.length > 1 ||
            !isEmptyLineOrEmptyCheckbox(lines[0]) ||
            list.getLevel() === 1) {
            return;
        }
        this.moveLeftOp.perform();
    }
}

class EnterOutdentIfLineIsEmptyFeature {
    constructor(plugin, settings, ime, obsidian, performOperation) {
        this.plugin = plugin;
        this.settings = settings;
        this.ime = ime;
        this.obsidian = obsidian;
        this.performOperation = performOperation;
        this.check = () => {
            return this.settings.betterEnter && !this.ime.isIMEOpened();
        };
        this.run = (editor) => {
            return this.performOperation.performOperation((root) => new OutdentIfLineIsEmptyOperation(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(state.Prec.highest(view.keymap.of([
                {
                    key: "Enter",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ])));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

function cmpPos(a, b) {
    return a.line - b.line || a.ch - b.ch;
}
function maxPos(a, b) {
    return cmpPos(a, b) < 0 ? b : a;
}
function minPos(a, b) {
    return cmpPos(a, b) < 0 ? a : b;
}
class List {
    constructor(root, indent, bullet, spaceAfterBullet, firstLine, folded) {
        this.root = root;
        this.indent = indent;
        this.bullet = bullet;
        this.spaceAfterBullet = spaceAfterBullet;
        this.folded = folded;
        this.parent = null;
        this.children = [];
        this.notesIndent = null;
        this.lines = [];
        this.lines.push(firstLine);
    }
    getNotesIndent() {
        return this.notesIndent;
    }
    setNotesIndent(notesIndent) {
        if (this.notesIndent !== null) {
            throw new Error(`Notes indent already provided`);
        }
        this.notesIndent = notesIndent;
    }
    addLine(text) {
        if (this.notesIndent === null) {
            throw new Error(`Unable to add line, notes indent should be provided first`);
        }
        this.lines.push(text);
    }
    replaceLines(lines) {
        if (lines.length > 1 && this.notesIndent === null) {
            throw new Error(`Unable to add line, notes indent should be provided first`);
        }
        this.lines = lines;
    }
    getLineCount() {
        return this.lines.length;
    }
    getRoot() {
        return this.root;
    }
    getChildren() {
        return this.children.concat();
    }
    getLinesInfo() {
        const startLine = this.root.getContentLinesRangeOf(this)[0];
        return this.lines.map((row, i) => {
            const line = startLine + i;
            const startCh = i === 0 ? this.getContentStartCh() : this.notesIndent.length;
            const endCh = startCh + row.length;
            return {
                text: row,
                from: { line, ch: startCh },
                to: { line, ch: endCh },
            };
        });
    }
    getLines() {
        return this.lines.concat();
    }
    getFirstLineContentStart() {
        const startLine = this.root.getContentLinesRangeOf(this)[0];
        return {
            line: startLine,
            ch: this.getContentStartCh(),
        };
    }
    getLastLineContentEnd() {
        const endLine = this.root.getContentLinesRangeOf(this)[1];
        const endCh = this.lines.length === 1
            ? this.getContentStartCh() + this.lines[0].length
            : this.notesIndent.length + this.lines[this.lines.length - 1].length;
        return {
            line: endLine,
            ch: endCh,
        };
    }
    getContentStartCh() {
        return this.indent.length + this.bullet.length + 1;
    }
    isFolded() {
        if (this.folded) {
            return true;
        }
        if (this.parent) {
            return this.parent.isFolded();
        }
        return false;
    }
    isFoldRoot() {
        let parent = this.getParent();
        while (parent) {
            if (parent.folded) {
                return false;
            }
            parent = parent.getParent();
        }
        return this.folded;
    }
    getLevel() {
        if (!this.parent) {
            return 0;
        }
        return this.parent.getLevel() + 1;
    }
    unindentContent(from, till) {
        this.indent = this.indent.slice(0, from) + this.indent.slice(till);
        if (this.notesIndent !== null) {
            this.notesIndent =
                this.notesIndent.slice(0, from) + this.notesIndent.slice(till);
        }
        for (const child of this.children) {
            child.unindentContent(from, till);
        }
    }
    indentContent(indentPos, indentChars) {
        this.indent =
            this.indent.slice(0, indentPos) +
                indentChars +
                this.indent.slice(indentPos);
        if (this.notesIndent !== null) {
            this.notesIndent =
                this.notesIndent.slice(0, indentPos) +
                    indentChars +
                    this.notesIndent.slice(indentPos);
        }
        for (const child of this.children) {
            child.indentContent(indentPos, indentChars);
        }
    }
    getFirstLineIndent() {
        return this.indent;
    }
    getBullet() {
        return this.bullet;
    }
    getSpaceAfterBullet() {
        return this.spaceAfterBullet;
    }
    replateBullet(bullet) {
        this.bullet = bullet;
    }
    getParent() {
        return this.parent;
    }
    addBeforeAll(list) {
        this.children.unshift(list);
        list.parent = this;
    }
    addAfterAll(list) {
        this.children.push(list);
        list.parent = this;
    }
    removeChild(list) {
        const i = this.children.indexOf(list);
        this.children.splice(i, 1);
        list.parent = null;
    }
    addBefore(before, list) {
        const i = this.children.indexOf(before);
        this.children.splice(i, 0, list);
        list.parent = this;
    }
    addAfter(before, list) {
        const i = this.children.indexOf(before);
        this.children.splice(i + 1, 0, list);
        list.parent = this;
    }
    getPrevSiblingOf(list) {
        const i = this.children.indexOf(list);
        return i > 0 ? this.children[i - 1] : null;
    }
    getNextSiblingOf(list) {
        const i = this.children.indexOf(list);
        return i >= 0 && i < this.children.length ? this.children[i + 1] : null;
    }
    isEmpty() {
        return this.children.length === 0;
    }
    print() {
        let res = "";
        for (let i = 0; i < this.lines.length; i++) {
            res +=
                i === 0
                    ? this.indent + this.bullet + this.spaceAfterBullet
                    : this.notesIndent;
            res += this.lines[i];
            res += "\n";
        }
        for (const child of this.children) {
            res += child.print();
        }
        return res;
    }
}
class Root {
    constructor(start, end, selections) {
        this.start = start;
        this.end = end;
        this.rootList = new List(this, "", "", "", "", false);
        this.selections = [];
        this.replaceSelections(selections);
    }
    getRootList() {
        return this.rootList;
    }
    getRange() {
        return [Object.assign({}, this.start), Object.assign({}, this.end)];
    }
    getSelections() {
        return this.selections.map((s) => ({
            anchor: Object.assign({}, s.anchor),
            head: Object.assign({}, s.head),
        }));
    }
    hasSingleCursor() {
        if (!this.hasSingleSelection()) {
            return false;
        }
        const selection = this.selections[0];
        return (selection.anchor.line === selection.head.line &&
            selection.anchor.ch === selection.head.ch);
    }
    hasSingleSelection() {
        return this.selections.length === 1;
    }
    getCursor() {
        return Object.assign({}, this.selections[this.selections.length - 1].head);
    }
    replaceCursor(cursor) {
        this.selections = [{ anchor: cursor, head: cursor }];
    }
    replaceSelections(selections) {
        if (selections.length < 1) {
            throw new Error(`Unable to create Root without selections`);
        }
        this.selections = selections;
    }
    getListUnderCursor() {
        return this.getListUnderLine(this.getCursor().line);
    }
    getListUnderLine(line) {
        if (line < this.start.line || line > this.end.line) {
            return;
        }
        let result = null;
        let index = this.start.line;
        const visitArr = (ll) => {
            for (const l of ll) {
                const listFromLine = index;
                const listTillLine = listFromLine + l.getLineCount() - 1;
                if (line >= listFromLine && line <= listTillLine) {
                    result = l;
                }
                else {
                    index = listTillLine + 1;
                    visitArr(l.getChildren());
                }
                if (result !== null) {
                    return;
                }
            }
        };
        visitArr(this.rootList.getChildren());
        return result;
    }
    getContentLinesRangeOf(list) {
        let result = null;
        let line = this.start.line;
        const visitArr = (ll) => {
            for (const l of ll) {
                const listFromLine = line;
                const listTillLine = listFromLine + l.getLineCount() - 1;
                if (l === list) {
                    result = [listFromLine, listTillLine];
                }
                else {
                    line = listTillLine + 1;
                    visitArr(l.getChildren());
                }
                if (result !== null) {
                    return;
                }
            }
        };
        visitArr(this.rootList.getChildren());
        return result;
    }
    getChildren() {
        return this.rootList.getChildren();
    }
    print() {
        let res = "";
        for (const child of this.rootList.getChildren()) {
            res += child.print();
        }
        return res.replace(/\n$/, "");
    }
}

class CreateNewItemOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const list = root.getListUnderCursor();
        const lines = list.getLinesInfo();
        if (lines.length === 1 && isEmptyLineOrEmptyCheckbox(lines[0].text)) {
            return;
        }
        const cursor = root.getCursor();
        const lineUnderCursor = lines.find((l) => l.from.line === cursor.line);
        if (cursor.ch < lineUnderCursor.from.ch) {
            return;
        }
        const { oldLines, newLines } = lines.reduce((acc, line) => {
            if (cursor.line > line.from.line) {
                acc.oldLines.push(line.text);
            }
            else if (cursor.line === line.from.line) {
                const a = line.text.slice(0, cursor.ch - line.from.ch);
                const b = line.text.slice(cursor.ch - line.from.ch);
                acc.oldLines.push(a);
                acc.newLines.push(b);
            }
            else if (cursor.line < line.from.line) {
                acc.newLines.push(line.text);
            }
            return acc;
        }, {
            oldLines: [],
            newLines: [],
        });
        const codeBlockBacticks = oldLines.join("\n").split("```").length - 1;
        const isInsideCodeblock = codeBlockBacticks > 0 && codeBlockBacticks % 2 !== 0;
        if (isInsideCodeblock) {
            return;
        }
        this.stopPropagation = true;
        this.updated = true;
        const endPos = list.getLastLineContentEnd();
        const onChildLevel = !list.isEmpty() && cursor.line === endPos.line && cursor.ch === endPos.ch;
        const indent = onChildLevel
            ? list.getChildren()[0].getFirstLineIndent()
            : list.getFirstLineIndent();
        const bullet = onChildLevel
            ? list.getChildren()[0].getBullet()
            : list.getBullet();
        const spaceAfterBullet = onChildLevel
            ? list.getChildren()[0].getSpaceAfterBullet()
            : list.getSpaceAfterBullet();
        const prefix = oldLines[0].match(/^\[[ x]\]/) ? "[ ] " : "";
        const newList = new List(list.getRoot(), indent, bullet, spaceAfterBullet, prefix + newLines.shift(), false);
        if (newLines.length > 0) {
            newList.setNotesIndent(list.getNotesIndent());
            for (const line of newLines) {
                newList.addLine(line);
            }
        }
        if (onChildLevel) {
            list.addBeforeAll(newList);
        }
        else {
            const children = list.getChildren();
            for (const child of children) {
                list.removeChild(child);
                newList.addAfterAll(child);
            }
            list.getParent().addAfter(list, newList);
        }
        list.replaceLines(oldLines);
        const newListStart = newList.getFirstLineContentStart();
        root.replaceCursor({
            line: newListStart.line,
            ch: newListStart.ch + prefix.length,
        });
        recalculateNumericBullets(root);
    }
}

class EnterShouldCreateNewItemFeature {
    constructor(plugin, settings, ime, obsidian, performOperation) {
        this.plugin = plugin;
        this.settings = settings;
        this.ime = ime;
        this.obsidian = obsidian;
        this.performOperation = performOperation;
        this.check = () => {
            return this.settings.betterEnter && !this.ime.isIMEOpened();
        };
        this.run = (editor) => {
            return this.performOperation.performOperation((root) => new CreateNewItemOperation(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(state.Prec.highest(view.keymap.of([
                {
                    key: "Enter",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ])));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class FoldFeature {
    constructor(plugin, obsidian) {
        this.plugin = plugin;
        this.obsidian = obsidian;
        this.fold = (editor) => {
            return this.setFold(editor, "fold");
        };
        this.unfold = (editor) => {
            return this.setFold(editor, "unfold");
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.addCommand({
                id: "fold",
                name: "Fold the list",
                editorCallback: this.obsidian.createEditorCallback(this.fold),
                hotkeys: [
                    {
                        modifiers: ["Mod"],
                        key: "ArrowUp",
                    },
                ],
            });
            this.plugin.addCommand({
                id: "unfold",
                name: "Unfold the list",
                editorCallback: this.obsidian.createEditorCallback(this.unfold),
                hotkeys: [
                    {
                        modifiers: ["Mod"],
                        key: "ArrowDown",
                    },
                ],
            });
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    setFold(editor, type) {
        if (!this.obsidian.getObsidianFoldSettings().foldIndent) {
            new obsidian.Notice(`Unable to ${type} because folding is disabled. Please enable "Fold indent" in Obsidian settings.`, 5000);
            return true;
        }
        const cursor = editor.getCursor();
        if (type === "fold") {
            editor.fold(cursor.line);
        }
        else {
            editor.unfold(cursor.line);
        }
        return true;
    }
}

const BETTER_LISTS_CLASS = "outliner-plugin-better-lists";
const BETTER_BULLETS_CLASS = "outliner-plugin-better-bullets";
const VERTICAL_LINES_CLASS = "outliner-plugin-vertical-lines";
const KNOWN_CLASSES = [
    BETTER_LISTS_CLASS,
    BETTER_BULLETS_CLASS,
    VERTICAL_LINES_CLASS,
];
class ListsStylesFeature {
    constructor(settings, obsidian) {
        this.settings = settings;
        this.obsidian = obsidian;
        this.syncListsStyles = () => {
            if (!this.settings.styleLists || !this.obsidian.isDefaultThemeEnabled()) {
                this.applyListsStyles([]);
                return;
            }
            const { tabSize } = this.obsidian.getObsidianTabsSettings();
            this.applyListsStyles([
                BETTER_LISTS_CLASS,
                BETTER_BULLETS_CLASS,
                tabSize === 4 ? VERTICAL_LINES_CLASS : null,
            ]);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.syncListsStyles();
            this.interval = window.setInterval(() => {
                this.syncListsStyles();
            }, 1000);
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            clearInterval(this.interval);
            this.applyListsStyles([]);
        });
    }
    applyListsStyles(classes) {
        const toKeep = classes.filter((c) => KNOWN_CLASSES.contains(c));
        const toRemove = KNOWN_CLASSES.filter((c) => !toKeep.contains(c));
        for (const c of toKeep) {
            if (!document.body.classList.contains(c)) {
                document.body.classList.add(c);
            }
        }
        for (const c of toRemove) {
            if (document.body.classList.contains(c)) {
                document.body.classList.remove(c);
            }
        }
    }
}

class MoveCursorToPreviousUnfoldedLineOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const list = this.root.getListUnderCursor();
        const cursor = this.root.getCursor();
        const lines = list.getLinesInfo();
        const lineNo = lines.findIndex((l) => cursor.ch === l.from.ch && cursor.line === l.from.line);
        if (lineNo === 0) {
            this.moveCursorToPreviousUnfoldedItem(root, cursor);
        }
        else if (lineNo > 0) {
            this.moveCursorToPreviousNoteLine(root, lines, lineNo);
        }
    }
    moveCursorToPreviousNoteLine(root, lines, lineNo) {
        this.stopPropagation = true;
        this.updated = true;
        root.replaceCursor(lines[lineNo - 1].to);
    }
    moveCursorToPreviousUnfoldedItem(root, cursor) {
        const prev = root.getListUnderLine(cursor.line - 1);
        if (!prev) {
            return;
        }
        this.stopPropagation = true;
        this.updated = true;
        if (prev.isFolded()) {
            let foldRoot = prev;
            while (!foldRoot.isFoldRoot()) {
                foldRoot = foldRoot.getParent();
            }
            const firstLineEnd = foldRoot.getLinesInfo()[0].to;
            root.replaceCursor(firstLineEnd);
        }
        else {
            root.replaceCursor(prev.getLastLineContentEnd());
        }
    }
}

class MoveCursorToPreviousUnfoldedLineFeature {
    constructor(plugin, settings, ime, obsidian, performOperation) {
        this.plugin = plugin;
        this.settings = settings;
        this.ime = ime;
        this.obsidian = obsidian;
        this.performOperation = performOperation;
        this.check = () => {
            return this.settings.stickCursor && !this.ime.isIMEOpened();
        };
        this.run = (editor) => {
            return this.performOperation.performOperation((root) => new MoveCursorToPreviousUnfoldedLineOperation(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    key: "ArrowLeft",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
                {
                    win: "c-ArrowLeft",
                    linux: "c-ArrowLeft",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class MoveDownOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const list = root.getListUnderCursor();
        const parent = list.getParent();
        const grandParent = parent.getParent();
        const next = parent.getNextSiblingOf(list);
        const listStartLineBefore = root.getContentLinesRangeOf(list)[0];
        if (!next && grandParent) {
            const newParent = grandParent.getNextSiblingOf(parent);
            if (newParent) {
                this.updated = true;
                parent.removeChild(list);
                newParent.addBeforeAll(list);
            }
        }
        else if (next) {
            this.updated = true;
            parent.removeChild(list);
            parent.addAfter(next, list);
        }
        if (!this.updated) {
            return;
        }
        const listStartLineAfter = root.getContentLinesRangeOf(list)[0];
        const lineDiff = listStartLineAfter - listStartLineBefore;
        const cursor = root.getCursor();
        root.replaceCursor({
            line: cursor.line + lineDiff,
            ch: cursor.ch,
        });
        recalculateNumericBullets(root);
    }
}

class MoveRightOperation {
    constructor(root, defaultIndentChars) {
        this.root = root;
        this.defaultIndentChars = defaultIndentChars;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const list = root.getListUnderCursor();
        const parent = list.getParent();
        const prev = parent.getPrevSiblingOf(list);
        if (!prev) {
            return;
        }
        this.updated = true;
        const listStartLineBefore = root.getContentLinesRangeOf(list)[0];
        const indentPos = list.getFirstLineIndent().length;
        let indentChars = "";
        if (indentChars === "" && !prev.isEmpty()) {
            indentChars = prev
                .getChildren()[0]
                .getFirstLineIndent()
                .slice(prev.getFirstLineIndent().length);
        }
        if (indentChars === "") {
            indentChars = list
                .getFirstLineIndent()
                .slice(parent.getFirstLineIndent().length);
        }
        if (indentChars === "" && !list.isEmpty()) {
            indentChars = list.getChildren()[0].getFirstLineIndent();
        }
        if (indentChars === "") {
            indentChars = this.defaultIndentChars;
        }
        parent.removeChild(list);
        prev.addAfterAll(list);
        list.indentContent(indentPos, indentChars);
        const listStartLineAfter = root.getContentLinesRangeOf(list)[0];
        const lineDiff = listStartLineAfter - listStartLineBefore;
        const cursor = root.getCursor();
        root.replaceCursor({
            line: cursor.line + lineDiff,
            ch: cursor.ch + indentChars.length,
        });
        recalculateNumericBullets(root);
    }
}

class MoveUpOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        const list = root.getListUnderCursor();
        const parent = list.getParent();
        const grandParent = parent.getParent();
        const prev = parent.getPrevSiblingOf(list);
        const listStartLineBefore = root.getContentLinesRangeOf(list)[0];
        if (!prev && grandParent) {
            const newParent = grandParent.getPrevSiblingOf(parent);
            if (newParent) {
                this.updated = true;
                parent.removeChild(list);
                newParent.addAfterAll(list);
            }
        }
        else if (prev) {
            this.updated = true;
            parent.removeChild(list);
            parent.addBefore(prev, list);
        }
        if (!this.updated) {
            return;
        }
        const listStartLineAfter = root.getContentLinesRangeOf(list)[0];
        const lineDiff = listStartLineAfter - listStartLineBefore;
        const cursor = root.getCursor();
        root.replaceCursor({
            line: cursor.line + lineDiff,
            ch: cursor.ch,
        });
        recalculateNumericBullets(root);
    }
}

class MoveItemsFeature {
    constructor(plugin, ime, obsidian, settings, performOperation) {
        this.plugin = plugin;
        this.ime = ime;
        this.obsidian = obsidian;
        this.settings = settings;
        this.performOperation = performOperation;
        this.check = () => {
            return this.settings.betterTab && !this.ime.isIMEOpened();
        };
        this.moveListElementDownCommand = (editor) => {
            const { shouldStopPropagation } = this.performOperation.performOperation((root) => new MoveDownOperation(root), editor);
            return shouldStopPropagation;
        };
        this.moveListElementUpCommand = (editor) => {
            const { shouldStopPropagation } = this.performOperation.performOperation((root) => new MoveUpOperation(root), editor);
            return shouldStopPropagation;
        };
        this.moveListElementRightCommand = (editor) => {
            if (this.ime.isIMEOpened()) {
                return true;
            }
            return this.moveListElementRight(editor).shouldStopPropagation;
        };
        this.moveListElementRight = (editor) => {
            return this.performOperation.performOperation((root) => new MoveRightOperation(root, this.obsidian.getDefaultIndentChars()), editor);
        };
        this.moveListElementLeftCommand = (editor) => {
            if (this.ime.isIMEOpened()) {
                return true;
            }
            return this.moveListElementLeft(editor).shouldStopPropagation;
        };
        this.moveListElementLeft = (editor) => {
            return this.performOperation.performOperation((root) => new MoveLeftOperation(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.addCommand({
                id: "move-list-item-up",
                name: "Move list and sublists up",
                editorCallback: this.obsidian.createEditorCallback(this.moveListElementUpCommand),
                hotkeys: [
                    {
                        modifiers: ["Mod", "Shift"],
                        key: "ArrowUp",
                    },
                ],
            });
            this.plugin.addCommand({
                id: "move-list-item-down",
                name: "Move list and sublists down",
                editorCallback: this.obsidian.createEditorCallback(this.moveListElementDownCommand),
                hotkeys: [
                    {
                        modifiers: ["Mod", "Shift"],
                        key: "ArrowDown",
                    },
                ],
            });
            this.plugin.addCommand({
                id: "indent-list",
                name: "Indent the list and sublists",
                editorCallback: this.obsidian.createEditorCallback(this.moveListElementRightCommand),
                hotkeys: [],
            });
            this.plugin.addCommand({
                id: "outdent-list",
                name: "Outdent the list and sublists",
                editorCallback: this.obsidian.createEditorCallback(this.moveListElementLeftCommand),
                hotkeys: [],
            });
            this.plugin.registerEditorExtension(state.Prec.highest(view.keymap.of([
                {
                    key: "Tab",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.moveListElementRight,
                    }),
                },
                {
                    key: "s-Tab",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.moveListElementLeft,
                    }),
                },
            ])));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class SelectAllOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleSelection()) {
            return;
        }
        const selection = root.getSelections()[0];
        const [rootStart, rootEnd] = root.getRange();
        const selectionFrom = minPos(selection.anchor, selection.head);
        const selectionTo = maxPos(selection.anchor, selection.head);
        if (selectionFrom.line < rootStart.line ||
            selectionTo.line > rootEnd.line) {
            return false;
        }
        if (selectionFrom.line === rootStart.line &&
            selectionFrom.ch === rootStart.ch &&
            selectionTo.line === rootEnd.line &&
            selectionTo.ch === rootEnd.ch) {
            return false;
        }
        const list = root.getListUnderCursor();
        const contentStart = list.getFirstLineContentStart();
        const contentEnd = list.getLastLineContentEnd();
        if (selectionFrom.line < contentStart.line ||
            selectionTo.line > contentEnd.line) {
            return false;
        }
        this.stopPropagation = true;
        this.updated = true;
        if (selectionFrom.line === contentStart.line &&
            selectionFrom.ch === contentStart.ch &&
            selectionTo.line === contentEnd.line &&
            selectionTo.ch === contentEnd.ch) {
            // select all list
            root.replaceSelections([{ anchor: rootStart, head: rootEnd }]);
        }
        else {
            // select all line
            root.replaceSelections([{ anchor: contentStart, head: contentEnd }]);
        }
        return true;
    }
}

class SelectAllFeature {
    constructor(plugin, settings, ime, obsidian, performOperation) {
        this.plugin = plugin;
        this.settings = settings;
        this.ime = ime;
        this.obsidian = obsidian;
        this.performOperation = performOperation;
        this.check = () => {
            return this.settings.selectAll && !this.ime.isIMEOpened();
        };
        this.run = (editor) => {
            return this.performOperation.performOperation((root) => new SelectAllOperation(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    key: "c-a",
                    mac: "m-a",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class SelectTillLineStartOperation {
    constructor(root) {
        this.root = root;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        this.stopPropagation = true;
        this.updated = true;
        const cursor = root.getCursor();
        const list = root.getListUnderCursor();
        const lines = list.getLinesInfo();
        const lineNo = lines.findIndex((l) => l.from.line === cursor.line);
        root.replaceSelections([{ head: lines[lineNo].from, anchor: cursor }]);
    }
}

class SelectionShouldIgnoreBulletsFeature {
    constructor(plugin, settings, ime, obsidian, performOperation) {
        this.plugin = plugin;
        this.settings = settings;
        this.ime = ime;
        this.obsidian = obsidian;
        this.performOperation = performOperation;
        this.check = () => {
            return this.settings.stickCursor && !this.ime.isIMEOpened();
        };
        this.run = (editor) => {
            return this.performOperation.performOperation((root) => new SelectTillLineStartOperation(root), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    key: "m-s-ArrowLeft",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class ObsidianOutlinerPluginSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin, settings) {
        super(app, plugin);
        this.settings = settings;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian.Setting(containerEl)
            .setName("Improve the style of your lists")
            .setDesc("Styles are only compatible with built-in Obsidian themes and may not be compatible with other themes. Styles only work well with tab size 4.")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.styleLists).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.styleLists = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Stick the cursor to the content")
            .setDesc("Don't let the cursor move to the bullet position.")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.stickCursor).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.stickCursor = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Enhance the Enter key")
            .setDesc("Make the Enter key behave the same as other outliners.")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.betterEnter).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.betterEnter = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Enhance the Tab key")
            .setDesc("Make Tab and Shift-Tab behave the same as other outliners.")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.betterTab).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.betterTab = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Enhance the Ctrl+A or Cmd+A behavior")
            .setDesc("Press the hotkey once to select the current list item. Press the hotkey twice to select the entire list.")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.selectAll).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.selectAll = value;
                yield this.settings.save();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Debug mode")
            .setDesc("Open DevTools (Command+Option+I or Control+Shift+I) to copy the debug logs.")
            .addToggle((toggle) => {
            toggle.setValue(this.settings.debug).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.settings.debug = value;
                yield this.settings.save();
            }));
        });
    }
}
class SettingsTabFeature {
    constructor(plugin, settings) {
        this.plugin = plugin;
        this.settings = settings;
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.addSettingTab(new ObsidianOutlinerPluginSettingTab(this.plugin.app, this.plugin, this.settings));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class CreateNoteLineOperation {
    constructor(root, defaultIndentChars) {
        this.root = root;
        this.defaultIndentChars = defaultIndentChars;
        this.stopPropagation = false;
        this.updated = false;
    }
    shouldStopPropagation() {
        return this.stopPropagation;
    }
    shouldUpdate() {
        return this.updated;
    }
    perform() {
        const { root } = this;
        if (!root.hasSingleCursor()) {
            return;
        }
        const cursor = root.getCursor();
        const list = root.getListUnderCursor();
        const lineUnderCursor = list
            .getLinesInfo()
            .find((l) => l.from.line === cursor.line);
        if (cursor.ch < lineUnderCursor.from.ch) {
            return;
        }
        this.stopPropagation = true;
        this.updated = true;
        if (!list.getNotesIndent()) {
            const indent = list.isEmpty()
                ? list.getFirstLineIndent() + this.defaultIndentChars
                : list.getChildren()[0].getFirstLineIndent();
            list.setNotesIndent(indent);
        }
        const lines = list.getLinesInfo().reduce((acc, line) => {
            if (cursor.line === line.from.line) {
                acc.push(line.text.slice(0, cursor.ch - line.from.ch));
                acc.push(line.text.slice(cursor.ch - line.from.ch));
            }
            else {
                acc.push(line.text);
            }
            return acc;
        }, []);
        list.replaceLines(lines);
        root.replaceCursor({
            line: cursor.line + 1,
            ch: list.getNotesIndent().length,
        });
    }
}

class ShiftEnterShouldCreateNoteFeature {
    constructor(plugin, obsidian, settings, ime, performOperation) {
        this.plugin = plugin;
        this.obsidian = obsidian;
        this.settings = settings;
        this.ime = ime;
        this.performOperation = performOperation;
        this.check = () => {
            return this.settings.betterEnter && !this.ime.isIMEOpened();
        };
        this.run = (editor) => {
            return this.performOperation.performOperation((root) => new CreateNoteLineOperation(root, this.obsidian.getDefaultIndentChars()), editor);
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.registerEditorExtension(view.keymap.of([
                {
                    key: "s-Enter",
                    run: this.obsidian.createKeymapRunCallback({
                        check: this.check,
                        run: this.run,
                    }),
                },
            ]));
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
}

class ApplyChangesService {
    applyChanges(editor, root) {
        const rootRange = root.getRange();
        const oldString = editor.getRange(rootRange[0], rootRange[1]);
        const newString = root.print();
        const fromLine = rootRange[0].line;
        const toLine = rootRange[1].line;
        for (let l = fromLine; l <= toLine; l++) {
            editor.unfold(l);
        }
        const changeFrom = Object.assign({}, rootRange[0]);
        const changeTo = Object.assign({}, rootRange[1]);
        let oldTmp = oldString;
        let newTmp = newString;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const nlIndex = oldTmp.indexOf("\n");
            if (nlIndex < 0) {
                break;
            }
            const oldLine = oldTmp.slice(0, nlIndex + 1);
            const newLine = newTmp.slice(0, oldLine.length);
            if (oldLine !== newLine) {
                break;
            }
            changeFrom.line++;
            oldTmp = oldTmp.slice(oldLine.length);
            newTmp = newTmp.slice(oldLine.length);
        }
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const nlIndex = oldTmp.lastIndexOf("\n");
            if (nlIndex < 0) {
                break;
            }
            const oldLine = oldTmp.slice(nlIndex);
            const newLine = newTmp.slice(-oldLine.length);
            if (oldLine !== newLine) {
                break;
            }
            oldTmp = oldTmp.slice(0, -oldLine.length);
            newTmp = newTmp.slice(0, -oldLine.length);
            const nlIndex2 = oldTmp.lastIndexOf("\n");
            changeTo.ch =
                nlIndex2 >= 0 ? oldTmp.length - nlIndex2 - 1 : oldTmp.length;
            changeTo.line--;
        }
        if (oldTmp !== newTmp) {
            editor.replaceRange(newTmp, changeFrom, changeTo);
        }
        editor.setSelections(root.getSelections());
        // TODO: lines could be different because of deletetion
        for (let l = fromLine; l <= toLine; l++) {
            const line = root.getListUnderLine(l);
            if (line && line.isFoldRoot()) {
                editor.fold(l);
            }
        }
    }
}

class IMEService {
    constructor() {
        this.composition = false;
        this.onCompositionStart = () => {
            this.composition = true;
        };
        this.onCompositionEnd = () => {
            this.composition = false;
        };
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            document.addEventListener("compositionstart", this.onCompositionStart);
            document.addEventListener("compositionend", this.onCompositionEnd);
        });
    }
    unload() {
        return __awaiter(this, void 0, void 0, function* () {
            document.removeEventListener("compositionend", this.onCompositionEnd);
            document.removeEventListener("compositionstart", this.onCompositionStart);
        });
    }
    isIMEOpened() {
        return this.composition;
    }
}

class LoggerService {
    constructor(settings) {
        this.settings = settings;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log(method, ...args) {
        if (!this.settings.debug) {
            return;
        }
        console.info(method, ...args);
    }
    bind(method) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (...args) => this.log(method, ...args);
    }
}

function foldInside(view, from, to) {
    let found = null;
    fold.foldedRanges(view.state).between(from, to, (from, to) => {
        if (!found || found.from > from)
            found = { from, to };
    });
    return found;
}
class MyEditor {
    constructor(e) {
        this.e = e;
    }
    getCursor() {
        return this.e.getCursor();
    }
    getLine(n) {
        return this.e.getLine(n);
    }
    lastLine() {
        return this.e.lastLine();
    }
    listSelections() {
        return this.e.listSelections();
    }
    getRange(from, to) {
        return this.e.getRange(from, to);
    }
    replaceRange(replacement, from, to) {
        return this.e.replaceRange(replacement, from, to);
    }
    setSelections(selections) {
        this.e.setSelections(selections);
    }
    setValue(text) {
        this.e.setValue(text);
    }
    getValue() {
        return this.e.getValue();
    }
    fold(n) {
        const view = this.getEditorView();
        const l = view.lineBlockAt(view.state.doc.line(n + 1).from);
        const range = language.foldable(view.state, l.from, l.to);
        if (!range || range.from === range.to) {
            return;
        }
        view.dispatch({ effects: [fold.foldEffect.of(range)] });
    }
    unfold(n) {
        const view = this.getEditorView();
        const l = view.lineBlockAt(view.state.doc.line(n + 1).from);
        const range = foldInside(view, l.from, l.to);
        if (!range) {
            return;
        }
        view.dispatch({ effects: [fold.unfoldEffect.of(range)] });
    }
    isFolded(n) {
        return this.getFirstLineOfFolding(n) !== null;
    }
    getFirstLineOfFolding(n) {
        const view = this.getEditorView();
        const l = view.lineBlockAt(view.state.doc.line(n + 1).from);
        const range = foldInside(view, l.from, l.to);
        if (!range) {
            return null;
        }
        return view.state.doc.lineAt(range.from).number - 1;
    }
    triggerOnKeyDown(e) {
        view.runScopeHandlers(this.getEditorView(), e, "editor");
    }
    getEditorView() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.e.cm;
    }
}

class ObsidianService {
    constructor(app) {
        this.app = app;
    }
    isLegacyEditorEnabled() {
        const config = Object.assign({ legacyEditor: true }, this.app.vault.config);
        return config.legacyEditor;
    }
    isDefaultThemeEnabled() {
        const config = Object.assign({ cssTheme: "" }, this.app.vault.config);
        return config.cssTheme === "";
    }
    getObsidianTabsSettings() {
        return Object.assign({ useTab: true, tabSize: 4 }, this.app.vault.config);
    }
    getObsidianFoldSettings() {
        return Object.assign({ foldIndent: false }, this.app.vault.config);
    }
    getDefaultIndentChars() {
        const { useTab, tabSize } = this.getObsidianTabsSettings();
        return useTab ? "\t" : new Array(tabSize).fill(" ").join("");
    }
    getEditorFromState(state) {
        return new MyEditor(state.field(obsidian.editorViewField).editor);
    }
    createKeymapRunCallback(config) {
        const check = config.check || (() => true);
        const { run } = config;
        return (view) => {
            const editor = this.getEditorFromState(view.state);
            if (!check(editor)) {
                return false;
            }
            const { shouldUpdate, shouldStopPropagation } = run(editor);
            return shouldUpdate || shouldStopPropagation;
        };
    }
    createEditorCallback(cb) {
        return (editor) => {
            const myEditor = new MyEditor(editor);
            const shouldStopPropagation = cb(myEditor);
            if (!shouldStopPropagation &&
                window.event &&
                window.event.type === "keydown") {
                myEditor.triggerOnKeyDown(window.event);
            }
        };
    }
}

const bulletSign = `(?:[-*+]|\\d+\\.)`;
const listItemWithoutSpacesRe = new RegExp(`^${bulletSign}( |\t)`);
const listItemRe = new RegExp(`^[ \t]*${bulletSign}( |\t)`);
const stringWithSpacesRe = new RegExp(`^[ \t]+`);
const parseListItemRe = new RegExp(`^([ \t]*)(${bulletSign})( |\t)(.*)$`);
class ParserService {
    constructor(logger) {
        this.logger = logger;
    }
    parse(editor, cursor = editor.getCursor()) {
        const d = this.logger.bind("parseList");
        const error = (msg) => {
            d(msg);
            return null;
        };
        const line = editor.getLine(cursor.line);
        let listLookingPos = null;
        if (this.isListItem(line)) {
            listLookingPos = cursor.line;
        }
        else if (this.isLineWithIndent(line)) {
            let listLookingPosSearch = cursor.line - 1;
            while (listLookingPosSearch >= 0) {
                const line = editor.getLine(listLookingPosSearch);
                if (this.isListItem(line)) {
                    listLookingPos = listLookingPosSearch;
                    break;
                }
                else if (this.isLineWithIndent(line)) {
                    listLookingPosSearch--;
                }
                else {
                    break;
                }
            }
        }
        if (listLookingPos == null) {
            return null;
        }
        let listStartLine = null;
        let listStartLineLookup = listLookingPos;
        while (listStartLineLookup >= 0) {
            const line = editor.getLine(listStartLineLookup);
            if (!this.isListItem(line) && !this.isLineWithIndent(line)) {
                break;
            }
            if (this.isListItemWithoutSpaces(line)) {
                listStartLine = listStartLineLookup;
            }
            listStartLineLookup--;
        }
        if (listStartLine === null) {
            return null;
        }
        let listEndLine = listLookingPos;
        let listEndLineLookup = listLookingPos;
        while (listEndLineLookup <= editor.lastLine()) {
            const line = editor.getLine(listEndLineLookup);
            if (!this.isListItem(line) && !this.isLineWithIndent(line)) {
                break;
            }
            if (!this.isEmptyLine(line)) {
                listEndLine = listEndLineLookup;
            }
            listEndLineLookup++;
        }
        if (listStartLine > cursor.line || listEndLine < cursor.line) {
            return null;
        }
        const root = new Root({ line: listStartLine, ch: 0 }, { line: listEndLine, ch: editor.getLine(listEndLine).length }, editor.listSelections().map((r) => ({
            anchor: { line: r.anchor.line, ch: r.anchor.ch },
            head: { line: r.head.line, ch: r.head.ch },
        })));
        let currentParent = root.getRootList();
        let currentList = null;
        let currentIndent = "";
        for (let l = listStartLine; l <= listEndLine; l++) {
            const line = editor.getLine(l);
            const matches = parseListItemRe.exec(line);
            if (matches) {
                const [, indent, bullet, spaceAfterBullet, content] = matches;
                const compareLength = Math.min(currentIndent.length, indent.length);
                const indentSlice = indent.slice(0, compareLength);
                const currentIndentSlice = currentIndent.slice(0, compareLength);
                if (indentSlice !== currentIndentSlice) {
                    const expected = currentIndentSlice
                        .replace(/ /g, "S")
                        .replace(/\t/g, "T");
                    const got = indentSlice.replace(/ /g, "S").replace(/\t/g, "T");
                    return error(`Unable to parse list: expected indent "${expected}", got "${got}"`);
                }
                if (indent.length > currentIndent.length) {
                    currentParent = currentList;
                    currentIndent = indent;
                }
                else if (indent.length < currentIndent.length) {
                    while (currentParent.getFirstLineIndent().length >= indent.length &&
                        currentParent.getParent()) {
                        currentParent = currentParent.getParent();
                    }
                    currentIndent = indent;
                }
                const folded = editor.getFirstLineOfFolding(Math.min(l, listEndLine)) === l;
                currentList = new List(root, indent, bullet, spaceAfterBullet, content, folded);
                currentParent.addAfterAll(currentList);
            }
            else if (this.isLineWithIndent(line)) {
                if (!currentList) {
                    return error(`Unable to parse list: expected list item, got empty line`);
                }
                const indentToCheck = currentList.getNotesIndent() || currentIndent;
                if (line.indexOf(indentToCheck) !== 0) {
                    const expected = indentToCheck.replace(/ /g, "S").replace(/\t/g, "T");
                    const got = line
                        .match(/^[ \t]*/)[0]
                        .replace(/ /g, "S")
                        .replace(/\t/g, "T");
                    return error(`Unable to parse list: expected indent "${expected}", got "${got}"`);
                }
                if (!currentList.getNotesIndent()) {
                    const matches = line.match(/^[ \t]+/);
                    if (!matches || matches[0].length <= currentIndent.length) {
                        if (/^\s+$/.test(line)) {
                            continue;
                        }
                        return error(`Unable to parse list: expected some indent, got no indent`);
                    }
                    currentList.setNotesIndent(matches[0]);
                }
                currentList.addLine(line.slice(currentList.getNotesIndent().length));
            }
            else {
                return error(`Unable to parse list: expected list item or note, got "${line}"`);
            }
        }
        return root;
    }
    isEmptyLine(line) {
        return line.length === 0;
    }
    isLineWithIndent(line) {
        return stringWithSpacesRe.test(line);
    }
    isListItem(line) {
        return listItemRe.test(line);
    }
    isListItemWithoutSpaces(line) {
        return listItemWithoutSpacesRe.test(line);
    }
}

class PerformOperationService {
    constructor(parser, applyChanges) {
        this.parser = parser;
        this.applyChanges = applyChanges;
    }
    evalOperation(root, op, editor) {
        op.perform();
        if (op.shouldUpdate()) {
            this.applyChanges.applyChanges(editor, root);
        }
        return {
            shouldUpdate: op.shouldUpdate(),
            shouldStopPropagation: op.shouldStopPropagation(),
        };
    }
    performOperation(cb, editor, cursor = editor.getCursor()) {
        const root = this.parser.parse(editor, cursor);
        if (!root) {
            return { shouldUpdate: false, shouldStopPropagation: false };
        }
        const op = cb(root);
        return this.evalOperation(root, op, editor);
    }
}

const DEFAULT_SETTINGS = {
    styleLists: false,
    debug: false,
    stickCursor: true,
    betterEnter: true,
    betterTab: true,
    selectAll: true,
};
class SettingsService {
    constructor(storage) {
        this.storage = storage;
        this.handlers = new Map();
    }
    get styleLists() {
        return this.values.styleLists;
    }
    set styleLists(value) {
        this.set("styleLists", value);
    }
    get debug() {
        return this.values.debug;
    }
    set debug(value) {
        this.set("debug", value);
    }
    get stickCursor() {
        return this.values.stickCursor;
    }
    set stickCursor(value) {
        this.set("stickCursor", value);
    }
    get betterEnter() {
        return this.values.betterEnter;
    }
    set betterEnter(value) {
        this.set("betterEnter", value);
    }
    get betterTab() {
        return this.values.betterTab;
    }
    set betterTab(value) {
        this.set("betterTab", value);
    }
    get selectAll() {
        return this.values.selectAll;
    }
    set selectAll(value) {
        this.set("selectAll", value);
    }
    onChange(key, cb) {
        if (!this.handlers.has(key)) {
            this.handlers.set(key, new Set());
        }
        this.handlers.get(key).add(cb);
    }
    removeCallback(key, cb) {
        const handlers = this.handlers.get(key);
        if (handlers) {
            handlers.delete(cb);
        }
    }
    reset() {
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
            this.set(k, v);
        }
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.values = Object.assign({}, DEFAULT_SETTINGS, yield this.storage.loadData());
        });
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.storage.saveData(this.values);
        });
    }
    set(key, value) {
        this.values[key] = value;
        const callbacks = this.handlers.get(key);
        if (!callbacks) {
            return;
        }
        for (const cb of callbacks.values()) {
            cb(value);
        }
    }
}

class ObsidianOutlinerPlugin extends obsidian.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Loading obsidian-outliner`);
            this.obsidian = new ObsidianService(this.app);
            if (this.obsidian.isLegacyEditorEnabled()) {
                new obsidian.Notice(`Outliner plugin does not support legacy editor mode starting from version 2.0. Please disable the "Use legacy editor" option or manually install version 1.0 of Outliner plugin.`, 30000);
                return;
            }
            this.settings = new SettingsService(this);
            yield this.settings.load();
            this.logger = new LoggerService(this.settings);
            this.parser = new ParserService(this.logger);
            this.applyChanges = new ApplyChangesService();
            this.performOperation = new PerformOperationService(this.parser, this.applyChanges);
            this.ime = new IMEService();
            yield this.ime.load();
            this.features = [
                new SettingsTabFeature(this, this.settings),
                new ListsStylesFeature(this.settings, this.obsidian),
                new EnterOutdentIfLineIsEmptyFeature(this, this.settings, this.ime, this.obsidian, this.performOperation),
                new EnterShouldCreateNewItemFeature(this, this.settings, this.ime, this.obsidian, this.performOperation),
                new EnsureCursorInListContentFeature(this, this.settings, this.obsidian, this.performOperation),
                new MoveCursorToPreviousUnfoldedLineFeature(this, this.settings, this.ime, this.obsidian, this.performOperation),
                new DeleteShouldIgnoreBulletsFeature(this, this.settings, this.ime, this.obsidian, this.performOperation),
                new SelectionShouldIgnoreBulletsFeature(this, this.settings, this.ime, this.obsidian, this.performOperation),
                new FoldFeature(this, this.obsidian),
                new SelectAllFeature(this, this.settings, this.ime, this.obsidian, this.performOperation),
                new MoveItemsFeature(this, this.ime, this.obsidian, this.settings, this.performOperation),
                new ShiftEnterShouldCreateNoteFeature(this, this.obsidian, this.settings, this.ime, this.performOperation),
            ];
            for (const feature of this.features) {
                yield feature.load();
            }
        });
    }
    onunload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Unloading obsidian-outliner`);
            yield this.ime.unload();
            for (const feature of this.features) {
                yield feature.unload();
            }
        });
    }
}

module.exports = ObsidianOutlinerPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsibm9kZV9tb2R1bGVzL3RzbGliL3RzbGliLmVzNi5qcyIsInNyYy9yb290L3JlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMudHMiLCJzcmMvb3BlcmF0aW9ucy9EZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91c0xpbmVPcGVyYXRpb24udHMiLCJzcmMvb3BlcmF0aW9ucy9EZWxldGVBbmRNZXJnZVdpdGhOZXh0TGluZU9wZXJhdGlvbi50cyIsInNyYy9vcGVyYXRpb25zL0RlbGV0ZVRpbGxMaW5lU3RhcnRPcGVyYXRpb24udHMiLCJzcmMvZmVhdHVyZXMvRGVsZXRlU2hvdWxkSWdub3JlQnVsbGV0c0ZlYXR1cmUudHMiLCJzcmMvb3BlcmF0aW9ucy9FbnN1cmVDdXJzb3JJbkxpc3RDb250ZW50T3BlcmF0aW9uLnRzIiwic3JjL29wZXJhdGlvbnMvRW5zdXJlQ3Vyc29ySXNJblVuZm9sZGVkTGluZU9wZXJhdGlvbi50cyIsInNyYy9mZWF0dXJlcy9FbnN1cmVDdXJzb3JJbkxpc3RDb250ZW50RmVhdHVyZS50cyIsInNyYy9vcGVyYXRpb25zL01vdmVMZWZ0T3BlcmF0aW9uLnRzIiwic3JjL3V0aWxzL2lzRW1wdHlMaW5lT3JFbXB0eUNoZWNrYm94LnRzIiwic3JjL29wZXJhdGlvbnMvT3V0ZGVudElmTGluZUlzRW1wdHlPcGVyYXRpb24udHMiLCJzcmMvZmVhdHVyZXMvRW50ZXJPdXRkZW50SWZMaW5lSXNFbXB0eUZlYXR1cmUudHMiLCJzcmMvcm9vdC9pbmRleC50cyIsInNyYy9vcGVyYXRpb25zL0NyZWF0ZU5ld0l0ZW1PcGVyYXRpb24udHMiLCJzcmMvZmVhdHVyZXMvRW50ZXJTaG91bGRDcmVhdGVOZXdJdGVtT25DaGlsZExldmVsRmVhdHVyZS50cyIsInNyYy9mZWF0dXJlcy9Gb2xkRmVhdHVyZS50cyIsInNyYy9mZWF0dXJlcy9MaXN0c1N0eWxlc0ZlYXR1cmUudHMiLCJzcmMvb3BlcmF0aW9ucy9Nb3ZlQ3Vyc29yVG9QcmV2aW91c1VuZm9sZGVkTGluZU9wZXJhdGlvbi50cyIsInNyYy9mZWF0dXJlcy9Nb3ZlQ3Vyc29yVG9QcmV2aW91c1VuZm9sZGVkTGluZUZlYXR1cmUudHMiLCJzcmMvb3BlcmF0aW9ucy9Nb3ZlRG93bk9wZXJhdGlvbi50cyIsInNyYy9vcGVyYXRpb25zL01vdmVSaWdodE9wZXJhdGlvbi50cyIsInNyYy9vcGVyYXRpb25zL01vdmVVcE9wZXJhdGlvbi50cyIsInNyYy9mZWF0dXJlcy9Nb3ZlSXRlbXNGZWF0dXJlLnRzIiwic3JjL29wZXJhdGlvbnMvU2VsZWN0QWxsT3BlcmF0aW9uLnRzIiwic3JjL2ZlYXR1cmVzL1NlbGVjdEFsbEZlYXR1cmUudHMiLCJzcmMvb3BlcmF0aW9ucy9TZWxlY3RUaWxsTGluZVN0YXJ0T3BlcmF0aW9uLnRzIiwic3JjL2ZlYXR1cmVzL1NlbGVjdGlvblNob3VsZElnbm9yZUJ1bGxldHNGZWF0dXJlLnRzIiwic3JjL2ZlYXR1cmVzL1NldHRpbmdzVGFiRmVhdHVyZS50cyIsInNyYy9vcGVyYXRpb25zL0NyZWF0ZU5vdGVMaW5lT3BlcmF0aW9uLnRzIiwic3JjL2ZlYXR1cmVzL1NoaWZ0RW50ZXJTaG91bGRDcmVhdGVOb3RlRmVhdHVyZS50cyIsInNyYy9zZXJ2aWNlcy9BcHBseUNoYW5nZXNTZXJ2aWNlLnRzIiwic3JjL3NlcnZpY2VzL0lNRVNlcnZpY2UudHMiLCJzcmMvc2VydmljZXMvTG9nZ2VyU2VydmljZS50cyIsInNyYy9NeUVkaXRvci50cyIsInNyYy9zZXJ2aWNlcy9PYnNpZGlhblNlcnZpY2UudHMiLCJzcmMvc2VydmljZXMvUGFyc2VyU2VydmljZS50cyIsInNyYy9zZXJ2aWNlcy9QZXJmb3JtT3BlcmF0aW9uU2VydmljZS50cyIsInNyYy9zZXJ2aWNlcy9TZXR0aW5nc1NlcnZpY2UudHMiLCJzcmMvT2JzaWRpYW5PdXRsaW5lclBsdWdpbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiEgKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uXHJcblxyXG5QZXJtaXNzaW9uIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBhbmQvb3IgZGlzdHJpYnV0ZSB0aGlzIHNvZnR3YXJlIGZvciBhbnlcclxucHVycG9zZSB3aXRoIG9yIHdpdGhvdXQgZmVlIGlzIGhlcmVieSBncmFudGVkLlxyXG5cclxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiBBTkQgVEhFIEFVVEhPUiBESVNDTEFJTVMgQUxMIFdBUlJBTlRJRVMgV0lUSFxyXG5SRUdBUkQgVE8gVEhJUyBTT0ZUV0FSRSBJTkNMVURJTkcgQUxMIElNUExJRUQgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFlcclxuQU5EIEZJVE5FU1MuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1IgQkUgTElBQkxFIEZPUiBBTlkgU1BFQ0lBTCwgRElSRUNULFxyXG5JTkRJUkVDVCwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTIE9SIEFOWSBEQU1BR0VTIFdIQVRTT0VWRVIgUkVTVUxUSU5HIEZST01cclxuTE9TUyBPRiBVU0UsIERBVEEgT1IgUFJPRklUUywgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIE5FR0xJR0VOQ0UgT1JcclxuT1RIRVIgVE9SVElPVVMgQUNUSU9OLCBBUklTSU5HIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFVTRSBPUlxyXG5QRVJGT1JNQU5DRSBPRiBUSElTIFNPRlRXQVJFLlxyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG4vKiBnbG9iYWwgUmVmbGVjdCwgUHJvbWlzZSAqL1xyXG5cclxudmFyIGV4dGVuZFN0YXRpY3MgPSBmdW5jdGlvbihkLCBiKSB7XHJcbiAgICBleHRlbmRTdGF0aWNzID0gT2JqZWN0LnNldFByb3RvdHlwZU9mIHx8XHJcbiAgICAgICAgKHsgX19wcm90b19fOiBbXSB9IGluc3RhbmNlb2YgQXJyYXkgJiYgZnVuY3Rpb24gKGQsIGIpIHsgZC5fX3Byb3RvX18gPSBiOyB9KSB8fFxyXG4gICAgICAgIGZ1bmN0aW9uIChkLCBiKSB7IGZvciAodmFyIHAgaW4gYikgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChiLCBwKSkgZFtwXSA9IGJbcF07IH07XHJcbiAgICByZXR1cm4gZXh0ZW5kU3RhdGljcyhkLCBiKTtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2V4dGVuZHMoZCwgYikge1xyXG4gICAgaWYgKHR5cGVvZiBiICE9PSBcImZ1bmN0aW9uXCIgJiYgYiAhPT0gbnVsbClcclxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2xhc3MgZXh0ZW5kcyB2YWx1ZSBcIiArIFN0cmluZyhiKSArIFwiIGlzIG5vdCBhIGNvbnN0cnVjdG9yIG9yIG51bGxcIik7XHJcbiAgICBleHRlbmRTdGF0aWNzKGQsIGIpO1xyXG4gICAgZnVuY3Rpb24gX18oKSB7IHRoaXMuY29uc3RydWN0b3IgPSBkOyB9XHJcbiAgICBkLnByb3RvdHlwZSA9IGIgPT09IG51bGwgPyBPYmplY3QuY3JlYXRlKGIpIDogKF9fLnByb3RvdHlwZSA9IGIucHJvdG90eXBlLCBuZXcgX18oKSk7XHJcbn1cclxuXHJcbmV4cG9ydCB2YXIgX19hc3NpZ24gPSBmdW5jdGlvbigpIHtcclxuICAgIF9fYXNzaWduID0gT2JqZWN0LmFzc2lnbiB8fCBmdW5jdGlvbiBfX2Fzc2lnbih0KSB7XHJcbiAgICAgICAgZm9yICh2YXIgcywgaSA9IDEsIG4gPSBhcmd1bWVudHMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XHJcbiAgICAgICAgICAgIHMgPSBhcmd1bWVudHNbaV07XHJcbiAgICAgICAgICAgIGZvciAodmFyIHAgaW4gcykgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzLCBwKSkgdFtwXSA9IHNbcF07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0O1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIF9fYXNzaWduLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3Jlc3QocywgZSkge1xyXG4gICAgdmFyIHQgPSB7fTtcclxuICAgIGZvciAodmFyIHAgaW4gcykgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzLCBwKSAmJiBlLmluZGV4T2YocCkgPCAwKVxyXG4gICAgICAgIHRbcF0gPSBzW3BdO1xyXG4gICAgaWYgKHMgIT0gbnVsbCAmJiB0eXBlb2YgT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scyA9PT0gXCJmdW5jdGlvblwiKVxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBwID0gT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scyhzKTsgaSA8IHAubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKGUuaW5kZXhPZihwW2ldKSA8IDAgJiYgT2JqZWN0LnByb3RvdHlwZS5wcm9wZXJ0eUlzRW51bWVyYWJsZS5jYWxsKHMsIHBbaV0pKVxyXG4gICAgICAgICAgICAgICAgdFtwW2ldXSA9IHNbcFtpXV07XHJcbiAgICAgICAgfVxyXG4gICAgcmV0dXJuIHQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2RlY29yYXRlKGRlY29yYXRvcnMsIHRhcmdldCwga2V5LCBkZXNjKSB7XHJcbiAgICB2YXIgYyA9IGFyZ3VtZW50cy5sZW5ndGgsIHIgPSBjIDwgMyA/IHRhcmdldCA6IGRlc2MgPT09IG51bGwgPyBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih0YXJnZXQsIGtleSkgOiBkZXNjLCBkO1xyXG4gICAgaWYgKHR5cGVvZiBSZWZsZWN0ID09PSBcIm9iamVjdFwiICYmIHR5cGVvZiBSZWZsZWN0LmRlY29yYXRlID09PSBcImZ1bmN0aW9uXCIpIHIgPSBSZWZsZWN0LmRlY29yYXRlKGRlY29yYXRvcnMsIHRhcmdldCwga2V5LCBkZXNjKTtcclxuICAgIGVsc2UgZm9yICh2YXIgaSA9IGRlY29yYXRvcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIGlmIChkID0gZGVjb3JhdG9yc1tpXSkgciA9IChjIDwgMyA/IGQocikgOiBjID4gMyA/IGQodGFyZ2V0LCBrZXksIHIpIDogZCh0YXJnZXQsIGtleSkpIHx8IHI7XHJcbiAgICByZXR1cm4gYyA+IDMgJiYgciAmJiBPYmplY3QuZGVmaW5lUHJvcGVydHkodGFyZ2V0LCBrZXksIHIpLCByO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19wYXJhbShwYXJhbUluZGV4LCBkZWNvcmF0b3IpIHtcclxuICAgIHJldHVybiBmdW5jdGlvbiAodGFyZ2V0LCBrZXkpIHsgZGVjb3JhdG9yKHRhcmdldCwga2V5LCBwYXJhbUluZGV4KTsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19tZXRhZGF0YShtZXRhZGF0YUtleSwgbWV0YWRhdGFWYWx1ZSkge1xyXG4gICAgaWYgKHR5cGVvZiBSZWZsZWN0ID09PSBcIm9iamVjdFwiICYmIHR5cGVvZiBSZWZsZWN0Lm1ldGFkYXRhID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiBSZWZsZWN0Lm1ldGFkYXRhKG1ldGFkYXRhS2V5LCBtZXRhZGF0YVZhbHVlKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fYXdhaXRlcih0aGlzQXJnLCBfYXJndW1lbnRzLCBQLCBnZW5lcmF0b3IpIHtcclxuICAgIGZ1bmN0aW9uIGFkb3B0KHZhbHVlKSB7IHJldHVybiB2YWx1ZSBpbnN0YW5jZW9mIFAgPyB2YWx1ZSA6IG5ldyBQKGZ1bmN0aW9uIChyZXNvbHZlKSB7IHJlc29sdmUodmFsdWUpOyB9KTsgfVxyXG4gICAgcmV0dXJuIG5ldyAoUCB8fCAoUCA9IFByb21pc2UpKShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgZnVuY3Rpb24gZnVsZmlsbGVkKHZhbHVlKSB7IHRyeSB7IHN0ZXAoZ2VuZXJhdG9yLm5leHQodmFsdWUpKTsgfSBjYXRjaCAoZSkgeyByZWplY3QoZSk7IH0gfVxyXG4gICAgICAgIGZ1bmN0aW9uIHJlamVjdGVkKHZhbHVlKSB7IHRyeSB7IHN0ZXAoZ2VuZXJhdG9yW1widGhyb3dcIl0odmFsdWUpKTsgfSBjYXRjaCAoZSkgeyByZWplY3QoZSk7IH0gfVxyXG4gICAgICAgIGZ1bmN0aW9uIHN0ZXAocmVzdWx0KSB7IHJlc3VsdC5kb25lID8gcmVzb2x2ZShyZXN1bHQudmFsdWUpIDogYWRvcHQocmVzdWx0LnZhbHVlKS50aGVuKGZ1bGZpbGxlZCwgcmVqZWN0ZWQpOyB9XHJcbiAgICAgICAgc3RlcCgoZ2VuZXJhdG9yID0gZ2VuZXJhdG9yLmFwcGx5KHRoaXNBcmcsIF9hcmd1bWVudHMgfHwgW10pKS5uZXh0KCkpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2dlbmVyYXRvcih0aGlzQXJnLCBib2R5KSB7XHJcbiAgICB2YXIgXyA9IHsgbGFiZWw6IDAsIHNlbnQ6IGZ1bmN0aW9uKCkgeyBpZiAodFswXSAmIDEpIHRocm93IHRbMV07IHJldHVybiB0WzFdOyB9LCB0cnlzOiBbXSwgb3BzOiBbXSB9LCBmLCB5LCB0LCBnO1xyXG4gICAgcmV0dXJuIGcgPSB7IG5leHQ6IHZlcmIoMCksIFwidGhyb3dcIjogdmVyYigxKSwgXCJyZXR1cm5cIjogdmVyYigyKSB9LCB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgKGdbU3ltYm9sLml0ZXJhdG9yXSA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpczsgfSksIGc7XHJcbiAgICBmdW5jdGlvbiB2ZXJiKG4pIHsgcmV0dXJuIGZ1bmN0aW9uICh2KSB7IHJldHVybiBzdGVwKFtuLCB2XSk7IH07IH1cclxuICAgIGZ1bmN0aW9uIHN0ZXAob3ApIHtcclxuICAgICAgICBpZiAoZikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkdlbmVyYXRvciBpcyBhbHJlYWR5IGV4ZWN1dGluZy5cIik7XHJcbiAgICAgICAgd2hpbGUgKF8pIHRyeSB7XHJcbiAgICAgICAgICAgIGlmIChmID0gMSwgeSAmJiAodCA9IG9wWzBdICYgMiA/IHlbXCJyZXR1cm5cIl0gOiBvcFswXSA/IHlbXCJ0aHJvd1wiXSB8fCAoKHQgPSB5W1wicmV0dXJuXCJdKSAmJiB0LmNhbGwoeSksIDApIDogeS5uZXh0KSAmJiAhKHQgPSB0LmNhbGwoeSwgb3BbMV0pKS5kb25lKSByZXR1cm4gdDtcclxuICAgICAgICAgICAgaWYgKHkgPSAwLCB0KSBvcCA9IFtvcFswXSAmIDIsIHQudmFsdWVdO1xyXG4gICAgICAgICAgICBzd2l0Y2ggKG9wWzBdKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDA6IGNhc2UgMTogdCA9IG9wOyBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgNDogXy5sYWJlbCsrOyByZXR1cm4geyB2YWx1ZTogb3BbMV0sIGRvbmU6IGZhbHNlIH07XHJcbiAgICAgICAgICAgICAgICBjYXNlIDU6IF8ubGFiZWwrKzsgeSA9IG9wWzFdOyBvcCA9IFswXTsgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICBjYXNlIDc6IG9wID0gXy5vcHMucG9wKCk7IF8udHJ5cy5wb3AoKTsgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghKHQgPSBfLnRyeXMsIHQgPSB0Lmxlbmd0aCA+IDAgJiYgdFt0Lmxlbmd0aCAtIDFdKSAmJiAob3BbMF0gPT09IDYgfHwgb3BbMF0gPT09IDIpKSB7IF8gPSAwOyBjb250aW51ZTsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcFswXSA9PT0gMyAmJiAoIXQgfHwgKG9wWzFdID4gdFswXSAmJiBvcFsxXSA8IHRbM10pKSkgeyBfLmxhYmVsID0gb3BbMV07IGJyZWFrOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wWzBdID09PSA2ICYmIF8ubGFiZWwgPCB0WzFdKSB7IF8ubGFiZWwgPSB0WzFdOyB0ID0gb3A7IGJyZWFrOyB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHQgJiYgXy5sYWJlbCA8IHRbMl0pIHsgXy5sYWJlbCA9IHRbMl07IF8ub3BzLnB1c2gob3ApOyBicmVhazsgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0WzJdKSBfLm9wcy5wb3AoKTtcclxuICAgICAgICAgICAgICAgICAgICBfLnRyeXMucG9wKCk7IGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG9wID0gYm9keS5jYWxsKHRoaXNBcmcsIF8pO1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHsgb3AgPSBbNiwgZV07IHkgPSAwOyB9IGZpbmFsbHkgeyBmID0gdCA9IDA7IH1cclxuICAgICAgICBpZiAob3BbMF0gJiA1KSB0aHJvdyBvcFsxXTsgcmV0dXJuIHsgdmFsdWU6IG9wWzBdID8gb3BbMV0gOiB2b2lkIDAsIGRvbmU6IHRydWUgfTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IHZhciBfX2NyZWF0ZUJpbmRpbmcgPSBPYmplY3QuY3JlYXRlID8gKGZ1bmN0aW9uKG8sIG0sIGssIGsyKSB7XHJcbiAgICBpZiAoazIgPT09IHVuZGVmaW5lZCkgazIgPSBrO1xyXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG8sIGsyLCB7IGVudW1lcmFibGU6IHRydWUsIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBtW2tdOyB9IH0pO1xyXG59KSA6IChmdW5jdGlvbihvLCBtLCBrLCBrMikge1xyXG4gICAgaWYgKGsyID09PSB1bmRlZmluZWQpIGsyID0gaztcclxuICAgIG9bazJdID0gbVtrXTtcclxufSk7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19leHBvcnRTdGFyKG0sIG8pIHtcclxuICAgIGZvciAodmFyIHAgaW4gbSkgaWYgKHAgIT09IFwiZGVmYXVsdFwiICYmICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwobywgcCkpIF9fY3JlYXRlQmluZGluZyhvLCBtLCBwKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fdmFsdWVzKG8pIHtcclxuICAgIHZhciBzID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIFN5bWJvbC5pdGVyYXRvciwgbSA9IHMgJiYgb1tzXSwgaSA9IDA7XHJcbiAgICBpZiAobSkgcmV0dXJuIG0uY2FsbChvKTtcclxuICAgIGlmIChvICYmIHR5cGVvZiBvLmxlbmd0aCA9PT0gXCJudW1iZXJcIikgcmV0dXJuIHtcclxuICAgICAgICBuZXh0OiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGlmIChvICYmIGkgPj0gby5sZW5ndGgpIG8gPSB2b2lkIDA7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHZhbHVlOiBvICYmIG9baSsrXSwgZG9uZTogIW8gfTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihzID8gXCJPYmplY3QgaXMgbm90IGl0ZXJhYmxlLlwiIDogXCJTeW1ib2wuaXRlcmF0b3IgaXMgbm90IGRlZmluZWQuXCIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19yZWFkKG8sIG4pIHtcclxuICAgIHZhciBtID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIG9bU3ltYm9sLml0ZXJhdG9yXTtcclxuICAgIGlmICghbSkgcmV0dXJuIG87XHJcbiAgICB2YXIgaSA9IG0uY2FsbChvKSwgciwgYXIgPSBbXSwgZTtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgd2hpbGUgKChuID09PSB2b2lkIDAgfHwgbi0tID4gMCkgJiYgIShyID0gaS5uZXh0KCkpLmRvbmUpIGFyLnB1c2goci52YWx1ZSk7XHJcbiAgICB9XHJcbiAgICBjYXRjaCAoZXJyb3IpIHsgZSA9IHsgZXJyb3I6IGVycm9yIH07IH1cclxuICAgIGZpbmFsbHkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmIChyICYmICFyLmRvbmUgJiYgKG0gPSBpW1wicmV0dXJuXCJdKSkgbS5jYWxsKGkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmaW5hbGx5IHsgaWYgKGUpIHRocm93IGUuZXJyb3I7IH1cclxuICAgIH1cclxuICAgIHJldHVybiBhcjtcclxufVxyXG5cclxuLyoqIEBkZXByZWNhdGVkICovXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3NwcmVhZCgpIHtcclxuICAgIGZvciAodmFyIGFyID0gW10sIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgIGFyID0gYXIuY29uY2F0KF9fcmVhZChhcmd1bWVudHNbaV0pKTtcclxuICAgIHJldHVybiBhcjtcclxufVxyXG5cclxuLyoqIEBkZXByZWNhdGVkICovXHJcbmV4cG9ydCBmdW5jdGlvbiBfX3NwcmVhZEFycmF5cygpIHtcclxuICAgIGZvciAodmFyIHMgPSAwLCBpID0gMCwgaWwgPSBhcmd1bWVudHMubGVuZ3RoOyBpIDwgaWw7IGkrKykgcyArPSBhcmd1bWVudHNbaV0ubGVuZ3RoO1xyXG4gICAgZm9yICh2YXIgciA9IEFycmF5KHMpLCBrID0gMCwgaSA9IDA7IGkgPCBpbDsgaSsrKVxyXG4gICAgICAgIGZvciAodmFyIGEgPSBhcmd1bWVudHNbaV0sIGogPSAwLCBqbCA9IGEubGVuZ3RoOyBqIDwgamw7IGorKywgaysrKVxyXG4gICAgICAgICAgICByW2tdID0gYVtqXTtcclxuICAgIHJldHVybiByO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19zcHJlYWRBcnJheSh0bywgZnJvbSwgcGFjaykge1xyXG4gICAgaWYgKHBhY2sgfHwgYXJndW1lbnRzLmxlbmd0aCA9PT0gMikgZm9yICh2YXIgaSA9IDAsIGwgPSBmcm9tLmxlbmd0aCwgYXI7IGkgPCBsOyBpKyspIHtcclxuICAgICAgICBpZiAoYXIgfHwgIShpIGluIGZyb20pKSB7XHJcbiAgICAgICAgICAgIGlmICghYXIpIGFyID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZnJvbSwgMCwgaSk7XHJcbiAgICAgICAgICAgIGFyW2ldID0gZnJvbVtpXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdG8uY29uY2F0KGFyIHx8IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGZyb20pKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fYXdhaXQodikge1xyXG4gICAgcmV0dXJuIHRoaXMgaW5zdGFuY2VvZiBfX2F3YWl0ID8gKHRoaXMudiA9IHYsIHRoaXMpIDogbmV3IF9fYXdhaXQodik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jR2VuZXJhdG9yKHRoaXNBcmcsIF9hcmd1bWVudHMsIGdlbmVyYXRvcikge1xyXG4gICAgaWYgKCFTeW1ib2wuYXN5bmNJdGVyYXRvcikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlN5bWJvbC5hc3luY0l0ZXJhdG9yIGlzIG5vdCBkZWZpbmVkLlwiKTtcclxuICAgIHZhciBnID0gZ2VuZXJhdG9yLmFwcGx5KHRoaXNBcmcsIF9hcmd1bWVudHMgfHwgW10pLCBpLCBxID0gW107XHJcbiAgICByZXR1cm4gaSA9IHt9LCB2ZXJiKFwibmV4dFwiKSwgdmVyYihcInRocm93XCIpLCB2ZXJiKFwicmV0dXJuXCIpLCBpW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXM7IH0sIGk7XHJcbiAgICBmdW5jdGlvbiB2ZXJiKG4pIHsgaWYgKGdbbl0pIGlbbl0gPSBmdW5jdGlvbiAodikgeyByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKGEsIGIpIHsgcS5wdXNoKFtuLCB2LCBhLCBiXSkgPiAxIHx8IHJlc3VtZShuLCB2KTsgfSk7IH07IH1cclxuICAgIGZ1bmN0aW9uIHJlc3VtZShuLCB2KSB7IHRyeSB7IHN0ZXAoZ1tuXSh2KSk7IH0gY2F0Y2ggKGUpIHsgc2V0dGxlKHFbMF1bM10sIGUpOyB9IH1cclxuICAgIGZ1bmN0aW9uIHN0ZXAocikgeyByLnZhbHVlIGluc3RhbmNlb2YgX19hd2FpdCA/IFByb21pc2UucmVzb2x2ZShyLnZhbHVlLnYpLnRoZW4oZnVsZmlsbCwgcmVqZWN0KSA6IHNldHRsZShxWzBdWzJdLCByKTsgfVxyXG4gICAgZnVuY3Rpb24gZnVsZmlsbCh2YWx1ZSkgeyByZXN1bWUoXCJuZXh0XCIsIHZhbHVlKTsgfVxyXG4gICAgZnVuY3Rpb24gcmVqZWN0KHZhbHVlKSB7IHJlc3VtZShcInRocm93XCIsIHZhbHVlKTsgfVxyXG4gICAgZnVuY3Rpb24gc2V0dGxlKGYsIHYpIHsgaWYgKGYodiksIHEuc2hpZnQoKSwgcS5sZW5ndGgpIHJlc3VtZShxWzBdWzBdLCBxWzBdWzFdKTsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19hc3luY0RlbGVnYXRvcihvKSB7XHJcbiAgICB2YXIgaSwgcDtcclxuICAgIHJldHVybiBpID0ge30sIHZlcmIoXCJuZXh0XCIpLCB2ZXJiKFwidGhyb3dcIiwgZnVuY3Rpb24gKGUpIHsgdGhyb3cgZTsgfSksIHZlcmIoXCJyZXR1cm5cIiksIGlbU3ltYm9sLml0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXM7IH0sIGk7XHJcbiAgICBmdW5jdGlvbiB2ZXJiKG4sIGYpIHsgaVtuXSA9IG9bbl0gPyBmdW5jdGlvbiAodikgeyByZXR1cm4gKHAgPSAhcCkgPyB7IHZhbHVlOiBfX2F3YWl0KG9bbl0odikpLCBkb25lOiBuID09PSBcInJldHVyblwiIH0gOiBmID8gZih2KSA6IHY7IH0gOiBmOyB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2FzeW5jVmFsdWVzKG8pIHtcclxuICAgIGlmICghU3ltYm9sLmFzeW5jSXRlcmF0b3IpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJTeW1ib2wuYXN5bmNJdGVyYXRvciBpcyBub3QgZGVmaW5lZC5cIik7XHJcbiAgICB2YXIgbSA9IG9bU3ltYm9sLmFzeW5jSXRlcmF0b3JdLCBpO1xyXG4gICAgcmV0dXJuIG0gPyBtLmNhbGwobykgOiAobyA9IHR5cGVvZiBfX3ZhbHVlcyA9PT0gXCJmdW5jdGlvblwiID8gX192YWx1ZXMobykgOiBvW1N5bWJvbC5pdGVyYXRvcl0oKSwgaSA9IHt9LCB2ZXJiKFwibmV4dFwiKSwgdmVyYihcInRocm93XCIpLCB2ZXJiKFwicmV0dXJuXCIpLCBpW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXM7IH0sIGkpO1xyXG4gICAgZnVuY3Rpb24gdmVyYihuKSB7IGlbbl0gPSBvW25dICYmIGZ1bmN0aW9uICh2KSB7IHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7IHYgPSBvW25dKHYpLCBzZXR0bGUocmVzb2x2ZSwgcmVqZWN0LCB2LmRvbmUsIHYudmFsdWUpOyB9KTsgfTsgfVxyXG4gICAgZnVuY3Rpb24gc2V0dGxlKHJlc29sdmUsIHJlamVjdCwgZCwgdikgeyBQcm9taXNlLnJlc29sdmUodikudGhlbihmdW5jdGlvbih2KSB7IHJlc29sdmUoeyB2YWx1ZTogdiwgZG9uZTogZCB9KTsgfSwgcmVqZWN0KTsgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19tYWtlVGVtcGxhdGVPYmplY3QoY29va2VkLCByYXcpIHtcclxuICAgIGlmIChPYmplY3QuZGVmaW5lUHJvcGVydHkpIHsgT2JqZWN0LmRlZmluZVByb3BlcnR5KGNvb2tlZCwgXCJyYXdcIiwgeyB2YWx1ZTogcmF3IH0pOyB9IGVsc2UgeyBjb29rZWQucmF3ID0gcmF3OyB9XHJcbiAgICByZXR1cm4gY29va2VkO1xyXG59O1xyXG5cclxudmFyIF9fc2V0TW9kdWxlRGVmYXVsdCA9IE9iamVjdC5jcmVhdGUgPyAoZnVuY3Rpb24obywgdikge1xyXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG8sIFwiZGVmYXVsdFwiLCB7IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiB2IH0pO1xyXG59KSA6IGZ1bmN0aW9uKG8sIHYpIHtcclxuICAgIG9bXCJkZWZhdWx0XCJdID0gdjtcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2ltcG9ydFN0YXIobW9kKSB7XHJcbiAgICBpZiAobW9kICYmIG1vZC5fX2VzTW9kdWxlKSByZXR1cm4gbW9kO1xyXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xyXG4gICAgaWYgKG1vZCAhPSBudWxsKSBmb3IgKHZhciBrIGluIG1vZCkgaWYgKGsgIT09IFwiZGVmYXVsdFwiICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChtb2QsIGspKSBfX2NyZWF0ZUJpbmRpbmcocmVzdWx0LCBtb2QsIGspO1xyXG4gICAgX19zZXRNb2R1bGVEZWZhdWx0KHJlc3VsdCwgbW9kKTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBfX2ltcG9ydERlZmF1bHQobW9kKSB7XHJcbiAgICByZXR1cm4gKG1vZCAmJiBtb2QuX19lc01vZHVsZSkgPyBtb2QgOiB7IGRlZmF1bHQ6IG1vZCB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gX19jbGFzc1ByaXZhdGVGaWVsZEdldChyZWNlaXZlciwgc3RhdGUsIGtpbmQsIGYpIHtcclxuICAgIGlmIChraW5kID09PSBcImFcIiAmJiAhZikgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlByaXZhdGUgYWNjZXNzb3Igd2FzIGRlZmluZWQgd2l0aG91dCBhIGdldHRlclwiKTtcclxuICAgIGlmICh0eXBlb2Ygc3RhdGUgPT09IFwiZnVuY3Rpb25cIiA/IHJlY2VpdmVyICE9PSBzdGF0ZSB8fCAhZiA6ICFzdGF0ZS5oYXMocmVjZWl2ZXIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHJlYWQgcHJpdmF0ZSBtZW1iZXIgZnJvbSBhbiBvYmplY3Qgd2hvc2UgY2xhc3MgZGlkIG5vdCBkZWNsYXJlIGl0XCIpO1xyXG4gICAgcmV0dXJuIGtpbmQgPT09IFwibVwiID8gZiA6IGtpbmQgPT09IFwiYVwiID8gZi5jYWxsKHJlY2VpdmVyKSA6IGYgPyBmLnZhbHVlIDogc3RhdGUuZ2V0KHJlY2VpdmVyKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIF9fY2xhc3NQcml2YXRlRmllbGRTZXQocmVjZWl2ZXIsIHN0YXRlLCB2YWx1ZSwga2luZCwgZikge1xyXG4gICAgaWYgKGtpbmQgPT09IFwibVwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBtZXRob2QgaXMgbm90IHdyaXRhYmxlXCIpO1xyXG4gICAgaWYgKGtpbmQgPT09IFwiYVwiICYmICFmKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiUHJpdmF0ZSBhY2Nlc3NvciB3YXMgZGVmaW5lZCB3aXRob3V0IGEgc2V0dGVyXCIpO1xyXG4gICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJmdW5jdGlvblwiID8gcmVjZWl2ZXIgIT09IHN0YXRlIHx8ICFmIDogIXN0YXRlLmhhcyhyZWNlaXZlcikpIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3Qgd3JpdGUgcHJpdmF0ZSBtZW1iZXIgdG8gYW4gb2JqZWN0IHdob3NlIGNsYXNzIGRpZCBub3QgZGVjbGFyZSBpdFwiKTtcclxuICAgIHJldHVybiAoa2luZCA9PT0gXCJhXCIgPyBmLmNhbGwocmVjZWl2ZXIsIHZhbHVlKSA6IGYgPyBmLnZhbHVlID0gdmFsdWUgOiBzdGF0ZS5zZXQocmVjZWl2ZXIsIHZhbHVlKSksIHZhbHVlO1xyXG59XHJcbiIsImltcG9ydCB7IExpc3QsIFJvb3QgfSBmcm9tIFwiLlwiO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVjYWxjdWxhdGVOdW1lcmljQnVsbGV0cyhyb290OiBSb290KSB7XG4gIGZ1bmN0aW9uIHZpc2l0KHBhcmVudDogUm9vdCB8IExpc3QpIHtcbiAgICBsZXQgaW5kZXggPSAxO1xuXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBwYXJlbnQuZ2V0Q2hpbGRyZW4oKSkge1xuICAgICAgaWYgKC9cXGQrXFwuLy50ZXN0KGNoaWxkLmdldEJ1bGxldCgpKSkge1xuICAgICAgICBjaGlsZC5yZXBsYXRlQnVsbGV0KGAke2luZGV4Kyt9LmApO1xuICAgICAgfVxuXG4gICAgICB2aXNpdChjaGlsZCk7XG4gICAgfVxuICB9XG5cbiAgdmlzaXQocm9vdCk7XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgTGlzdCwgTGlzdExpbmUsIFBvc2l0aW9uLCBSb290IH0gZnJvbSBcIi4uL3Jvb3RcIjtcbmltcG9ydCB7IHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMgfSBmcm9tIFwiLi4vcm9vdC9yZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzXCI7XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91c0xpbmVPcGVyYXRpb24gaW1wbGVtZW50cyBPcGVyYXRpb24ge1xuICBwcml2YXRlIHN0b3BQcm9wYWdhdGlvbiA9IGZhbHNlO1xuICBwcml2YXRlIHVwZGF0ZWQgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJvb3Q6IFJvb3QpIHt9XG5cbiAgc2hvdWxkU3RvcFByb3BhZ2F0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0b3BQcm9wYWdhdGlvbjtcbiAgfVxuXG4gIHNob3VsZFVwZGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVkO1xuICB9XG5cbiAgcGVyZm9ybSgpIHtcbiAgICBjb25zdCB7IHJvb3QgfSA9IHRoaXM7XG5cbiAgICBpZiAoIXJvb3QuaGFzU2luZ2xlQ3Vyc29yKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBsaXN0ID0gcm9vdC5nZXRMaXN0VW5kZXJDdXJzb3IoKTtcbiAgICBjb25zdCBjdXJzb3IgPSByb290LmdldEN1cnNvcigpO1xuICAgIGNvbnN0IGxpbmVzID0gbGlzdC5nZXRMaW5lc0luZm8oKTtcblxuICAgIGNvbnN0IGxpbmVObyA9IGxpbmVzLmZpbmRJbmRleChcbiAgICAgIChsKSA9PiBjdXJzb3IuY2ggPT09IGwuZnJvbS5jaCAmJiBjdXJzb3IubGluZSA9PT0gbC5mcm9tLmxpbmVcbiAgICApO1xuXG4gICAgaWYgKGxpbmVObyA9PT0gMCkge1xuICAgICAgdGhpcy5tZXJnZVdpdGhQcmV2aW91c0l0ZW0ocm9vdCwgY3Vyc29yLCBsaXN0KTtcbiAgICB9IGVsc2UgaWYgKGxpbmVObyA+IDApIHtcbiAgICAgIHRoaXMubWVyZ2VOb3Rlcyhyb290LCBjdXJzb3IsIGxpc3QsIGxpbmVzLCBsaW5lTm8pO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgbWVyZ2VOb3RlcyhcbiAgICByb290OiBSb290LFxuICAgIGN1cnNvcjogUG9zaXRpb24sXG4gICAgbGlzdDogTGlzdCxcbiAgICBsaW5lczogTGlzdExpbmVbXSxcbiAgICBsaW5lTm86IG51bWJlclxuICApIHtcbiAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbiA9IHRydWU7XG4gICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcblxuICAgIGNvbnN0IHByZXZMaW5lTm8gPSBsaW5lTm8gLSAxO1xuXG4gICAgcm9vdC5yZXBsYWNlQ3Vyc29yKHtcbiAgICAgIGxpbmU6IGN1cnNvci5saW5lIC0gMSxcbiAgICAgIGNoOiBsaW5lc1twcmV2TGluZU5vXS50ZXh0Lmxlbmd0aCArIGxpbmVzW3ByZXZMaW5lTm9dLmZyb20uY2gsXG4gICAgfSk7XG5cbiAgICBsaW5lc1twcmV2TGluZU5vXS50ZXh0ICs9IGxpbmVzW2xpbmVOb10udGV4dDtcbiAgICBsaW5lcy5zcGxpY2UobGluZU5vLCAxKTtcblxuICAgIGxpc3QucmVwbGFjZUxpbmVzKGxpbmVzLm1hcCgobCkgPT4gbC50ZXh0KSk7XG4gIH1cblxuICBwcml2YXRlIG1lcmdlV2l0aFByZXZpb3VzSXRlbShyb290OiBSb290LCBjdXJzb3I6IFBvc2l0aW9uLCBsaXN0OiBMaXN0KSB7XG4gICAgaWYgKHJvb3QuZ2V0Q2hpbGRyZW4oKVswXSA9PT0gbGlzdCAmJiBsaXN0LmdldENoaWxkcmVuKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuXG4gICAgY29uc3QgcHJldiA9IHJvb3QuZ2V0TGlzdFVuZGVyTGluZShjdXJzb3IubGluZSAtIDEpO1xuXG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgYm90aEFyZUVtcHR5ID0gcHJldi5pc0VtcHR5KCkgJiYgbGlzdC5pc0VtcHR5KCk7XG4gICAgY29uc3QgcHJldklzRW1wdHlBbmRTYW1lTGV2ZWwgPVxuICAgICAgcHJldi5pc0VtcHR5KCkgJiYgIWxpc3QuaXNFbXB0eSgpICYmIHByZXYuZ2V0TGV2ZWwoKSA9PSBsaXN0LmdldExldmVsKCk7XG4gICAgY29uc3QgbGlzdElzRW1wdHlBbmRQcmV2SXNQYXJlbnQgPVxuICAgICAgbGlzdC5pc0VtcHR5KCkgJiYgcHJldi5nZXRMZXZlbCgpID09IGxpc3QuZ2V0TGV2ZWwoKSAtIDE7XG5cbiAgICBpZiAoYm90aEFyZUVtcHR5IHx8IHByZXZJc0VtcHR5QW5kU2FtZUxldmVsIHx8IGxpc3RJc0VtcHR5QW5kUHJldklzUGFyZW50KSB7XG4gICAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBwYXJlbnQgPSBsaXN0LmdldFBhcmVudCgpO1xuICAgICAgY29uc3QgcHJldkVuZCA9IHByZXYuZ2V0TGFzdExpbmVDb250ZW50RW5kKCk7XG5cbiAgICAgIGlmICghcHJldi5nZXROb3Rlc0luZGVudCgpICYmIGxpc3QuZ2V0Tm90ZXNJbmRlbnQoKSkge1xuICAgICAgICBwcmV2LnNldE5vdGVzSW5kZW50KFxuICAgICAgICAgIHByZXYuZ2V0Rmlyc3RMaW5lSW5kZW50KCkgK1xuICAgICAgICAgICAgbGlzdC5nZXROb3Rlc0luZGVudCgpLnNsaWNlKGxpc3QuZ2V0Rmlyc3RMaW5lSW5kZW50KCkubGVuZ3RoKVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBvbGRMaW5lcyA9IHByZXYuZ2V0TGluZXMoKTtcbiAgICAgIGNvbnN0IG5ld0xpbmVzID0gbGlzdC5nZXRMaW5lcygpO1xuICAgICAgb2xkTGluZXNbb2xkTGluZXMubGVuZ3RoIC0gMV0gKz0gbmV3TGluZXNbMF07XG4gICAgICBjb25zdCByZXN1bHRMaW5lcyA9IG9sZExpbmVzLmNvbmNhdChuZXdMaW5lcy5zbGljZSgxKSk7XG5cbiAgICAgIHByZXYucmVwbGFjZUxpbmVzKHJlc3VsdExpbmVzKTtcbiAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChsaXN0KTtcblxuICAgICAgZm9yIChjb25zdCBjIG9mIGxpc3QuZ2V0Q2hpbGRyZW4oKSkge1xuICAgICAgICBsaXN0LnJlbW92ZUNoaWxkKGMpO1xuICAgICAgICBwcmV2LmFkZEFmdGVyQWxsKGMpO1xuICAgICAgfVxuXG4gICAgICByb290LnJlcGxhY2VDdXJzb3IocHJldkVuZCk7XG5cbiAgICAgIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMocm9vdCk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBEZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91c0xpbmVPcGVyYXRpb24gfSBmcm9tIFwiLi9EZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91c0xpbmVPcGVyYXRpb25cIjtcbmltcG9ydCB7IE9wZXJhdGlvbiB9IGZyb20gXCIuL09wZXJhdGlvblwiO1xuXG5pbXBvcnQgeyBSb290IH0gZnJvbSBcIi4uL3Jvb3RcIjtcblxuZXhwb3J0IGNsYXNzIERlbGV0ZUFuZE1lcmdlV2l0aE5leHRMaW5lT3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBkZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91czogRGVsZXRlQW5kTWVyZ2VXaXRoUHJldmlvdXNMaW5lT3BlcmF0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcm9vdDogUm9vdCkge1xuICAgIHRoaXMuZGVsZXRlQW5kTWVyZ2VXaXRoUHJldmlvdXMgPVxuICAgICAgbmV3IERlbGV0ZUFuZE1lcmdlV2l0aFByZXZpb3VzTGluZU9wZXJhdGlvbihyb290KTtcbiAgfVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5kZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91cy5zaG91bGRTdG9wUHJvcGFnYXRpb24oKTtcbiAgfVxuXG4gIHNob3VsZFVwZGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy5kZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91cy5zaG91bGRVcGRhdGUoKTtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcbiAgICBjb25zdCBsaW5lcyA9IGxpc3QuZ2V0TGluZXNJbmZvKCk7XG5cbiAgICBjb25zdCBsaW5lTm8gPSBsaW5lcy5maW5kSW5kZXgoXG4gICAgICAobCkgPT4gY3Vyc29yLmNoID09PSBsLnRvLmNoICYmIGN1cnNvci5saW5lID09PSBsLnRvLmxpbmVcbiAgICApO1xuXG4gICAgaWYgKGxpbmVObyA9PT0gbGluZXMubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbmV4dExpbmUgPSBsaW5lc1tsaW5lTm9dLnRvLmxpbmUgKyAxO1xuICAgICAgY29uc3QgbmV4dExpc3QgPSByb290LmdldExpc3RVbmRlckxpbmUobmV4dExpbmUpO1xuICAgICAgaWYgKCFuZXh0TGlzdCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICByb290LnJlcGxhY2VDdXJzb3IobmV4dExpc3QuZ2V0Rmlyc3RMaW5lQ29udGVudFN0YXJ0KCkpO1xuICAgICAgdGhpcy5kZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91cy5wZXJmb3JtKCk7XG4gICAgfSBlbHNlIGlmIChsaW5lTm8gPj0gMCkge1xuICAgICAgcm9vdC5yZXBsYWNlQ3Vyc29yKGxpbmVzW2xpbmVObyArIDFdLmZyb20pO1xuICAgICAgdGhpcy5kZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91cy5wZXJmb3JtKCk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVUaWxsTGluZVN0YXJ0T3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuICAgIHRoaXMudXBkYXRlZCA9IHRydWU7XG5cbiAgICBjb25zdCBjdXJzb3IgPSByb290LmdldEN1cnNvcigpO1xuICAgIGNvbnN0IGxpc3QgPSByb290LmdldExpc3RVbmRlckN1cnNvcigpO1xuICAgIGNvbnN0IGxpbmVzID0gbGlzdC5nZXRMaW5lc0luZm8oKTtcbiAgICBjb25zdCBsaW5lTm8gPSBsaW5lcy5maW5kSW5kZXgoKGwpID0+IGwuZnJvbS5saW5lID09PSBjdXJzb3IubGluZSk7XG5cbiAgICBsaW5lc1tsaW5lTm9dLnRleHQgPSBsaW5lc1tsaW5lTm9dLnRleHQuc2xpY2UoXG4gICAgICBjdXJzb3IuY2ggLSBsaW5lc1tsaW5lTm9dLmZyb20uY2hcbiAgICApO1xuXG4gICAgbGlzdC5yZXBsYWNlTGluZXMobGluZXMubWFwKChsKSA9PiBsLnRleHQpKTtcbiAgICByb290LnJlcGxhY2VDdXJzb3IobGluZXNbbGluZU5vXS5mcm9tKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luXzIgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsga2V5bWFwIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuL0ZlYXR1cmVcIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vTXlFZGl0b3JcIjtcbmltcG9ydCB7IERlbGV0ZUFuZE1lcmdlV2l0aE5leHRMaW5lT3BlcmF0aW9uIH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvRGVsZXRlQW5kTWVyZ2VXaXRoTmV4dExpbmVPcGVyYXRpb25cIjtcbmltcG9ydCB7IERlbGV0ZUFuZE1lcmdlV2l0aFByZXZpb3VzTGluZU9wZXJhdGlvbiB9IGZyb20gXCIuLi9vcGVyYXRpb25zL0RlbGV0ZUFuZE1lcmdlV2l0aFByZXZpb3VzTGluZU9wZXJhdGlvblwiO1xuaW1wb3J0IHsgRGVsZXRlVGlsbExpbmVTdGFydE9wZXJhdGlvbiB9IGZyb20gXCIuLi9vcGVyYXRpb25zL0RlbGV0ZVRpbGxMaW5lU3RhcnRPcGVyYXRpb25cIjtcbmltcG9ydCB7IElNRVNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvSU1FU2VydmljZVwiO1xuaW1wb3J0IHsgT2JzaWRpYW5TZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09ic2lkaWFuU2VydmljZVwiO1xuaW1wb3J0IHsgUGVyZm9ybU9wZXJhdGlvblNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvUGVyZm9ybU9wZXJhdGlvblNlcnZpY2VcIjtcbmltcG9ydCB7IFNldHRpbmdzU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1NlcnZpY2VcIjtcblxuZXhwb3J0IGNsYXNzIERlbGV0ZVNob3VsZElnbm9yZUJ1bGxldHNGZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW5fMixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UsXG4gICAgcHJpdmF0ZSBpbWU6IElNRVNlcnZpY2UsXG4gICAgcHJpdmF0ZSBvYnNpZGlhbjogT2JzaWRpYW5TZXJ2aWNlLFxuICAgIHByaXZhdGUgcGVyZm9ybU9wZXJhdGlvbjogUGVyZm9ybU9wZXJhdGlvblNlcnZpY2VcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBrZXltYXAub2YoW1xuICAgICAgICB7XG4gICAgICAgICAga2V5OiBcIkJhY2tzcGFjZVwiLFxuICAgICAgICAgIHJ1bjogdGhpcy5vYnNpZGlhbi5jcmVhdGVLZXltYXBSdW5DYWxsYmFjayh7XG4gICAgICAgICAgICBjaGVjazogdGhpcy5jaGVjayxcbiAgICAgICAgICAgIHJ1bjogdGhpcy5kZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91c0xpbmUsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6IFwiRGVsZXRlXCIsXG4gICAgICAgICAgcnVuOiB0aGlzLm9ic2lkaWFuLmNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrKHtcbiAgICAgICAgICAgIGNoZWNrOiB0aGlzLmNoZWNrLFxuICAgICAgICAgICAgcnVuOiB0aGlzLmRlbGV0ZUFuZE1lcmdlV2l0aE5leHRMaW5lLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbWFjOiBcIm0tQmFja3NwYWNlXCIsXG4gICAgICAgICAgcnVuOiB0aGlzLm9ic2lkaWFuLmNyZWF0ZUtleW1hcFJ1bkNhbGxiYWNrKHtcbiAgICAgICAgICAgIGNoZWNrOiB0aGlzLmNoZWNrLFxuICAgICAgICAgICAgcnVuOiB0aGlzLmRlbGV0ZVRpbGxMaW5lU3RhcnQsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICBdKVxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2hlY2sgPSAoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuc2V0dGluZ3Muc3RpY2tDdXJzb3IgJiYgIXRoaXMuaW1lLmlzSU1FT3BlbmVkKCk7XG4gIH07XG5cbiAgcHJpdmF0ZSBkZWxldGVBbmRNZXJnZVdpdGhQcmV2aW91c0xpbmUgPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLnBlcmZvcm1PcGVyYXRpb24ucGVyZm9ybU9wZXJhdGlvbihcbiAgICAgIChyb290KSA9PiBuZXcgRGVsZXRlQW5kTWVyZ2VXaXRoUHJldmlvdXNMaW5lT3BlcmF0aW9uKHJvb3QpLFxuICAgICAgZWRpdG9yXG4gICAgKTtcbiAgfTtcblxuICBwcml2YXRlIGRlbGV0ZVRpbGxMaW5lU3RhcnQgPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLnBlcmZvcm1PcGVyYXRpb24ucGVyZm9ybU9wZXJhdGlvbihcbiAgICAgIChyb290KSA9PiBuZXcgRGVsZXRlVGlsbExpbmVTdGFydE9wZXJhdGlvbihyb290KSxcbiAgICAgIGVkaXRvclxuICAgICk7XG4gIH07XG5cbiAgcHJpdmF0ZSBkZWxldGVBbmRNZXJnZVdpdGhOZXh0TGluZSA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMucGVyZm9ybU9wZXJhdGlvbi5wZXJmb3JtT3BlcmF0aW9uKFxuICAgICAgKHJvb3QpID0+IG5ldyBEZWxldGVBbmRNZXJnZVdpdGhOZXh0TGluZU9wZXJhdGlvbihyb290KSxcbiAgICAgIGVkaXRvclxuICAgICk7XG4gIH07XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBFbnN1cmVDdXJzb3JJbkxpc3RDb250ZW50T3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuXG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcbiAgICBjb25zdCBsaXN0ID0gcm9vdC5nZXRMaXN0VW5kZXJDdXJzb3IoKTtcbiAgICBjb25zdCBjb250ZW50U3RhcnQgPSBsaXN0LmdldEZpcnN0TGluZUNvbnRlbnRTdGFydCgpO1xuICAgIGNvbnN0IGxpbmVQcmVmaXggPVxuICAgICAgY29udGVudFN0YXJ0LmxpbmUgPT09IGN1cnNvci5saW5lXG4gICAgICAgID8gY29udGVudFN0YXJ0LmNoXG4gICAgICAgIDogbGlzdC5nZXROb3Rlc0luZGVudCgpLmxlbmd0aDtcblxuICAgIGlmIChjdXJzb3IuY2ggPCBsaW5lUHJlZml4KSB7XG4gICAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuICAgICAgcm9vdC5yZXBsYWNlQ3Vyc29yKHtcbiAgICAgICAgbGluZTogY3Vyc29yLmxpbmUsXG4gICAgICAgIGNoOiBsaW5lUHJlZml4LFxuICAgICAgfSk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBFbnN1cmVDdXJzb3JJc0luVW5mb2xkZWRMaW5lT3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuXG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcblxuICAgIGNvbnN0IGxpc3QgPSByb290LmdldExpc3RVbmRlckN1cnNvcigpO1xuICAgIGlmICghbGlzdC5pc0ZvbGRlZCgpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IGZvbGRSb290ID0gbGlzdDtcbiAgICB3aGlsZSAoIWZvbGRSb290LmlzRm9sZFJvb3QoKSkge1xuICAgICAgZm9sZFJvb3QgPSBmb2xkUm9vdC5nZXRQYXJlbnQoKTtcbiAgICB9XG5cbiAgICBjb25zdCBmaXJzdExpbmVFbmQgPSBmb2xkUm9vdC5nZXRMaW5lc0luZm8oKVswXS50bztcblxuICAgIGlmIChjdXJzb3IubGluZSA+IGZpcnN0TGluZUVuZC5saW5lKSB7XG4gICAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuICAgICAgcm9vdC5yZXBsYWNlQ3Vyc29yKGZpcnN0TGluZUVuZCk7XG4gICAgfVxuICB9XG59XG4iLCJpbXBvcnQgeyBQbHVnaW5fMiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSwgVHJhbnNhY3Rpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vTXlFZGl0b3JcIjtcbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi4vZmVhdHVyZXMvRmVhdHVyZVwiO1xuaW1wb3J0IHsgRW5zdXJlQ3Vyc29ySW5MaXN0Q29udGVudE9wZXJhdGlvbiB9IGZyb20gXCIuLi9vcGVyYXRpb25zL0Vuc3VyZUN1cnNvckluTGlzdENvbnRlbnRPcGVyYXRpb25cIjtcbmltcG9ydCB7IEVuc3VyZUN1cnNvcklzSW5VbmZvbGRlZExpbmVPcGVyYXRpb24gfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9FbnN1cmVDdXJzb3JJc0luVW5mb2xkZWRMaW5lT3BlcmF0aW9uXCI7XG5pbXBvcnQgeyBPYnNpZGlhblNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvT2JzaWRpYW5TZXJ2aWNlXCI7XG5pbXBvcnQgeyBQZXJmb3JtT3BlcmF0aW9uU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9QZXJmb3JtT3BlcmF0aW9uU2VydmljZVwiO1xuaW1wb3J0IHsgU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1NldHRpbmdzU2VydmljZVwiO1xuXG5leHBvcnQgY2xhc3MgRW5zdXJlQ3Vyc29ySW5MaXN0Q29udGVudEZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbl8yLFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzU2VydmljZSxcbiAgICBwcml2YXRlIG9ic2lkaWFuOiBPYnNpZGlhblNlcnZpY2UsXG4gICAgcHJpdmF0ZSBwZXJmb3JtT3BlcmF0aW9uOiBQZXJmb3JtT3BlcmF0aW9uU2VydmljZVxuICApIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcbiAgICAgIEVkaXRvclN0YXRlLnRyYW5zYWN0aW9uRXh0ZW5kZXIub2YodGhpcy50cmFuc2FjdGlvbkV4dGVuZGVyKVxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgdHJhbnNhY3Rpb25FeHRlbmRlciA9ICh0cjogVHJhbnNhY3Rpb24pOiBudWxsID0+IHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3Muc3RpY2tDdXJzb3IgfHwgIXRyLnNlbGVjdGlvbikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgZWRpdG9yID0gdGhpcy5vYnNpZGlhbi5nZXRFZGl0b3JGcm9tU3RhdGUodHIuc3RhcnRTdGF0ZSk7XG5cbiAgICBzZXRJbW1lZGlhdGUoKCkgPT4ge1xuICAgICAgdGhpcy5oYW5kbGVDdXJzb3JBY3Rpdml0eShlZGl0b3IpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIG51bGw7XG4gIH07XG5cbiAgcHJpdmF0ZSBoYW5kbGVDdXJzb3JBY3Rpdml0eSA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgdGhpcy5wZXJmb3JtT3BlcmF0aW9uLnBlcmZvcm1PcGVyYXRpb24oXG4gICAgICAocm9vdCkgPT4gbmV3IEVuc3VyZUN1cnNvcklzSW5VbmZvbGRlZExpbmVPcGVyYXRpb24ocm9vdCksXG4gICAgICBlZGl0b3JcbiAgICApO1xuXG4gICAgdGhpcy5wZXJmb3JtT3BlcmF0aW9uLnBlcmZvcm1PcGVyYXRpb24oXG4gICAgICAocm9vdCkgPT4gbmV3IEVuc3VyZUN1cnNvckluTGlzdENvbnRlbnRPcGVyYXRpb24ocm9vdCksXG4gICAgICBlZGl0b3JcbiAgICApO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgT3BlcmF0aW9uIH0gZnJvbSBcIi4vT3BlcmF0aW9uXCI7XG5cbmltcG9ydCB7IFJvb3QgfSBmcm9tIFwiLi4vcm9vdFwiO1xuaW1wb3J0IHsgcmVjYWxjdWxhdGVOdW1lcmljQnVsbGV0cyB9IGZyb20gXCIuLi9yb290L3JlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHNcIjtcblxuZXhwb3J0IGNsYXNzIE1vdmVMZWZ0T3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgcGFyZW50ID0gbGlzdC5nZXRQYXJlbnQoKTtcbiAgICBjb25zdCBncmFuZFBhcmVudCA9IHBhcmVudC5nZXRQYXJlbnQoKTtcblxuICAgIGlmICghZ3JhbmRQYXJlbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuXG4gICAgY29uc3QgbGlzdFN0YXJ0TGluZUJlZm9yZSA9IHJvb3QuZ2V0Q29udGVudExpbmVzUmFuZ2VPZihsaXN0KVswXTtcbiAgICBjb25zdCBpbmRlbnRSbUZyb20gPSBwYXJlbnQuZ2V0Rmlyc3RMaW5lSW5kZW50KCkubGVuZ3RoO1xuICAgIGNvbnN0IGluZGVudFJtVGlsbCA9IGxpc3QuZ2V0Rmlyc3RMaW5lSW5kZW50KCkubGVuZ3RoO1xuXG4gICAgcGFyZW50LnJlbW92ZUNoaWxkKGxpc3QpO1xuICAgIGdyYW5kUGFyZW50LmFkZEFmdGVyKHBhcmVudCwgbGlzdCk7XG4gICAgbGlzdC51bmluZGVudENvbnRlbnQoaW5kZW50Um1Gcm9tLCBpbmRlbnRSbVRpbGwpO1xuXG4gICAgY29uc3QgbGlzdFN0YXJ0TGluZUFmdGVyID0gcm9vdC5nZXRDb250ZW50TGluZXNSYW5nZU9mKGxpc3QpWzBdO1xuICAgIGNvbnN0IGxpbmVEaWZmID0gbGlzdFN0YXJ0TGluZUFmdGVyIC0gbGlzdFN0YXJ0TGluZUJlZm9yZTtcbiAgICBjb25zdCBjaERpZmYgPSBpbmRlbnRSbVRpbGwgLSBpbmRlbnRSbUZyb207XG5cbiAgICBjb25zdCBjdXJzb3IgPSByb290LmdldEN1cnNvcigpO1xuICAgIHJvb3QucmVwbGFjZUN1cnNvcih7XG4gICAgICBsaW5lOiBjdXJzb3IubGluZSArIGxpbmVEaWZmLFxuICAgICAgY2g6IGN1cnNvci5jaCAtIGNoRGlmZixcbiAgICB9KTtcblxuICAgIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMocm9vdCk7XG4gIH1cbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5TGluZU9yRW1wdHlDaGVja2JveChsaW5lOiBzdHJpbmcpIHtcbiAgcmV0dXJuIGxpbmUgPT09IFwiXCIgfHwgbGluZSA9PT0gXCJbIF0gXCI7XG59XG4iLCJpbXBvcnQgeyBNb3ZlTGVmdE9wZXJhdGlvbiB9IGZyb20gXCIuL01vdmVMZWZ0T3BlcmF0aW9uXCI7XG5pbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5pbXBvcnQgeyBpc0VtcHR5TGluZU9yRW1wdHlDaGVja2JveCB9IGZyb20gXCIuLi91dGlscy9pc0VtcHR5TGluZU9yRW1wdHlDaGVja2JveFwiO1xuXG5leHBvcnQgY2xhc3MgT3V0ZGVudElmTGluZUlzRW1wdHlPcGVyYXRpb24gaW1wbGVtZW50cyBPcGVyYXRpb24ge1xuICBwcml2YXRlIG1vdmVMZWZ0T3A6IE1vdmVMZWZ0T3BlcmF0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcm9vdDogUm9vdCkge1xuICAgIHRoaXMubW92ZUxlZnRPcCA9IG5ldyBNb3ZlTGVmdE9wZXJhdGlvbihyb290KTtcbiAgfVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5tb3ZlTGVmdE9wLnNob3VsZFN0b3BQcm9wYWdhdGlvbigpO1xuICB9XG5cbiAgc2hvdWxkVXBkYXRlKCkge1xuICAgIHJldHVybiB0aGlzLm1vdmVMZWZ0T3Auc2hvdWxkVXBkYXRlKCk7XG4gIH1cblxuICBwZXJmb3JtKCkge1xuICAgIGNvbnN0IHsgcm9vdCB9ID0gdGhpcztcblxuICAgIGlmICghcm9vdC5oYXNTaW5nbGVDdXJzb3IoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGxpc3QgPSByb290LmdldExpc3RVbmRlckN1cnNvcigpO1xuICAgIGNvbnN0IGxpbmVzID0gbGlzdC5nZXRMaW5lcygpO1xuXG4gICAgaWYgKFxuICAgICAgbGluZXMubGVuZ3RoID4gMSB8fFxuICAgICAgIWlzRW1wdHlMaW5lT3JFbXB0eUNoZWNrYm94KGxpbmVzWzBdKSB8fFxuICAgICAgbGlzdC5nZXRMZXZlbCgpID09PSAxXG4gICAgKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5tb3ZlTGVmdE9wLnBlcmZvcm0oKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luXzIgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsga2V5bWFwIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vTXlFZGl0b3JcIjtcbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi4vZmVhdHVyZXMvRmVhdHVyZVwiO1xuaW1wb3J0IHsgT3V0ZGVudElmTGluZUlzRW1wdHlPcGVyYXRpb24gfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9PdXRkZW50SWZMaW5lSXNFbXB0eU9wZXJhdGlvblwiO1xuaW1wb3J0IHsgSU1FU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9JTUVTZXJ2aWNlXCI7XG5pbXBvcnQgeyBPYnNpZGlhblNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvT2JzaWRpYW5TZXJ2aWNlXCI7XG5pbXBvcnQgeyBQZXJmb3JtT3BlcmF0aW9uU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9QZXJmb3JtT3BlcmF0aW9uU2VydmljZVwiO1xuaW1wb3J0IHsgU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1NldHRpbmdzU2VydmljZVwiO1xuXG5leHBvcnQgY2xhc3MgRW50ZXJPdXRkZW50SWZMaW5lSXNFbXB0eUZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbl8yLFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzU2VydmljZSxcbiAgICBwcml2YXRlIGltZTogSU1FU2VydmljZSxcbiAgICBwcml2YXRlIG9ic2lkaWFuOiBPYnNpZGlhblNlcnZpY2UsXG4gICAgcHJpdmF0ZSBwZXJmb3JtT3BlcmF0aW9uOiBQZXJmb3JtT3BlcmF0aW9uU2VydmljZVxuICApIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcbiAgICAgIFByZWMuaGlnaGVzdChcbiAgICAgICAga2V5bWFwLm9mKFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBrZXk6IFwiRW50ZXJcIixcbiAgICAgICAgICAgIHJ1bjogdGhpcy5vYnNpZGlhbi5jcmVhdGVLZXltYXBSdW5DYWxsYmFjayh7XG4gICAgICAgICAgICAgIGNoZWNrOiB0aGlzLmNoZWNrLFxuICAgICAgICAgICAgICBydW46IHRoaXMucnVuLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgfSxcbiAgICAgICAgXSlcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cblxuICBwcml2YXRlIGNoZWNrID0gKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmJldHRlckVudGVyICYmICF0aGlzLmltZS5pc0lNRU9wZW5lZCgpO1xuICB9O1xuXG4gIHByaXZhdGUgcnVuID0gKGVkaXRvcjogTXlFZGl0b3IpID0+IHtcbiAgICByZXR1cm4gdGhpcy5wZXJmb3JtT3BlcmF0aW9uLnBlcmZvcm1PcGVyYXRpb24oXG4gICAgICAocm9vdCkgPT4gbmV3IE91dGRlbnRJZkxpbmVJc0VtcHR5T3BlcmF0aW9uKHJvb3QpLFxuICAgICAgZWRpdG9yXG4gICAgKTtcbiAgfTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBjbXBQb3MoYTogUG9zaXRpb24sIGI6IFBvc2l0aW9uKSB7XG4gIHJldHVybiBhLmxpbmUgLSBiLmxpbmUgfHwgYS5jaCAtIGIuY2g7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXhQb3MoYTogUG9zaXRpb24sIGI6IFBvc2l0aW9uKSB7XG4gIHJldHVybiBjbXBQb3MoYSwgYikgPCAwID8gYiA6IGE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtaW5Qb3MoYTogUG9zaXRpb24sIGI6IFBvc2l0aW9uKSB7XG4gIHJldHVybiBjbXBQb3MoYSwgYikgPCAwID8gYSA6IGI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUG9zaXRpb24ge1xuICBjaDogbnVtYmVyO1xuICBsaW5lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlzdExpbmUge1xuICB0ZXh0OiBzdHJpbmc7XG4gIGZyb206IFBvc2l0aW9uO1xuICB0bzogUG9zaXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmFuZ2Uge1xuICBhbmNob3I6IFBvc2l0aW9uO1xuICBoZWFkOiBQb3NpdGlvbjtcbn1cblxuZXhwb3J0IGNsYXNzIExpc3Qge1xuICBwcml2YXRlIHBhcmVudDogTGlzdCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGNoaWxkcmVuOiBMaXN0W10gPSBbXTtcbiAgcHJpdmF0ZSBub3Rlc0luZGVudDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbGluZXM6IHN0cmluZ1tdID0gW107XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSByb290OiBSb290LFxuICAgIHByaXZhdGUgaW5kZW50OiBzdHJpbmcsXG4gICAgcHJpdmF0ZSBidWxsZXQ6IHN0cmluZyxcbiAgICBwcml2YXRlIHNwYWNlQWZ0ZXJCdWxsZXQ6IHN0cmluZyxcbiAgICBmaXJzdExpbmU6IHN0cmluZyxcbiAgICBwcml2YXRlIGZvbGRlZDogYm9vbGVhblxuICApIHtcbiAgICB0aGlzLmxpbmVzLnB1c2goZmlyc3RMaW5lKTtcbiAgfVxuXG4gIGdldE5vdGVzSW5kZW50KCk6IHN0cmluZyB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLm5vdGVzSW5kZW50O1xuICB9XG5cbiAgc2V0Tm90ZXNJbmRlbnQobm90ZXNJbmRlbnQ6IHN0cmluZykge1xuICAgIGlmICh0aGlzLm5vdGVzSW5kZW50ICE9PSBudWxsKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vdGVzIGluZGVudCBhbHJlYWR5IHByb3ZpZGVkYCk7XG4gICAgfVxuICAgIHRoaXMubm90ZXNJbmRlbnQgPSBub3Rlc0luZGVudDtcbiAgfVxuXG4gIGFkZExpbmUodGV4dDogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMubm90ZXNJbmRlbnQgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYFVuYWJsZSB0byBhZGQgbGluZSwgbm90ZXMgaW5kZW50IHNob3VsZCBiZSBwcm92aWRlZCBmaXJzdGBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdGhpcy5saW5lcy5wdXNoKHRleHQpO1xuICB9XG5cbiAgcmVwbGFjZUxpbmVzKGxpbmVzOiBzdHJpbmdbXSkge1xuICAgIGlmIChsaW5lcy5sZW5ndGggPiAxICYmIHRoaXMubm90ZXNJbmRlbnQgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYFVuYWJsZSB0byBhZGQgbGluZSwgbm90ZXMgaW5kZW50IHNob3VsZCBiZSBwcm92aWRlZCBmaXJzdGBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdGhpcy5saW5lcyA9IGxpbmVzO1xuICB9XG5cbiAgZ2V0TGluZUNvdW50KCkge1xuICAgIHJldHVybiB0aGlzLmxpbmVzLmxlbmd0aDtcbiAgfVxuXG4gIGdldFJvb3QoKSB7XG4gICAgcmV0dXJuIHRoaXMucm9vdDtcbiAgfVxuXG4gIGdldENoaWxkcmVuKCkge1xuICAgIHJldHVybiB0aGlzLmNoaWxkcmVuLmNvbmNhdCgpO1xuICB9XG5cbiAgZ2V0TGluZXNJbmZvKCk6IExpc3RMaW5lW10ge1xuICAgIGNvbnN0IHN0YXJ0TGluZSA9IHRoaXMucm9vdC5nZXRDb250ZW50TGluZXNSYW5nZU9mKHRoaXMpWzBdO1xuXG4gICAgcmV0dXJuIHRoaXMubGluZXMubWFwKChyb3csIGkpID0+IHtcbiAgICAgIGNvbnN0IGxpbmUgPSBzdGFydExpbmUgKyBpO1xuICAgICAgY29uc3Qgc3RhcnRDaCA9XG4gICAgICAgIGkgPT09IDAgPyB0aGlzLmdldENvbnRlbnRTdGFydENoKCkgOiB0aGlzLm5vdGVzSW5kZW50Lmxlbmd0aDtcbiAgICAgIGNvbnN0IGVuZENoID0gc3RhcnRDaCArIHJvdy5sZW5ndGg7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHRleHQ6IHJvdyxcbiAgICAgICAgZnJvbTogeyBsaW5lLCBjaDogc3RhcnRDaCB9LFxuICAgICAgICB0bzogeyBsaW5lLCBjaDogZW5kQ2ggfSxcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBnZXRMaW5lcygpOiBzdHJpbmdbXSB7XG4gICAgcmV0dXJuIHRoaXMubGluZXMuY29uY2F0KCk7XG4gIH1cblxuICBnZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKSB7XG4gICAgY29uc3Qgc3RhcnRMaW5lID0gdGhpcy5yb290LmdldENvbnRlbnRMaW5lc1JhbmdlT2YodGhpcylbMF07XG5cbiAgICByZXR1cm4ge1xuICAgICAgbGluZTogc3RhcnRMaW5lLFxuICAgICAgY2g6IHRoaXMuZ2V0Q29udGVudFN0YXJ0Q2goKSxcbiAgICB9O1xuICB9XG5cbiAgZ2V0TGFzdExpbmVDb250ZW50RW5kKCkge1xuICAgIGNvbnN0IGVuZExpbmUgPSB0aGlzLnJvb3QuZ2V0Q29udGVudExpbmVzUmFuZ2VPZih0aGlzKVsxXTtcbiAgICBjb25zdCBlbmRDaCA9XG4gICAgICB0aGlzLmxpbmVzLmxlbmd0aCA9PT0gMVxuICAgICAgICA/IHRoaXMuZ2V0Q29udGVudFN0YXJ0Q2goKSArIHRoaXMubGluZXNbMF0ubGVuZ3RoXG4gICAgICAgIDogdGhpcy5ub3Rlc0luZGVudC5sZW5ndGggKyB0aGlzLmxpbmVzW3RoaXMubGluZXMubGVuZ3RoIC0gMV0ubGVuZ3RoO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGxpbmU6IGVuZExpbmUsXG4gICAgICBjaDogZW5kQ2gsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0Q29udGVudFN0YXJ0Q2goKSB7XG4gICAgcmV0dXJuIHRoaXMuaW5kZW50Lmxlbmd0aCArIHRoaXMuYnVsbGV0Lmxlbmd0aCArIDE7XG4gIH1cblxuICBpc0ZvbGRlZCgpOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5mb2xkZWQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnBhcmVudCkge1xuICAgICAgcmV0dXJuIHRoaXMucGFyZW50LmlzRm9sZGVkKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaXNGb2xkUm9vdCgpIHtcbiAgICBsZXQgcGFyZW50ID0gdGhpcy5nZXRQYXJlbnQoKTtcblxuICAgIHdoaWxlIChwYXJlbnQpIHtcbiAgICAgIGlmIChwYXJlbnQuZm9sZGVkKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgcGFyZW50ID0gcGFyZW50LmdldFBhcmVudCgpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmZvbGRlZDtcbiAgfVxuXG4gIGdldExldmVsKCk6IG51bWJlciB7XG4gICAgaWYgKCF0aGlzLnBhcmVudCkge1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMucGFyZW50LmdldExldmVsKCkgKyAxO1xuICB9XG5cbiAgdW5pbmRlbnRDb250ZW50KGZyb206IG51bWJlciwgdGlsbDogbnVtYmVyKSB7XG4gICAgdGhpcy5pbmRlbnQgPSB0aGlzLmluZGVudC5zbGljZSgwLCBmcm9tKSArIHRoaXMuaW5kZW50LnNsaWNlKHRpbGwpO1xuICAgIGlmICh0aGlzLm5vdGVzSW5kZW50ICE9PSBudWxsKSB7XG4gICAgICB0aGlzLm5vdGVzSW5kZW50ID1cbiAgICAgICAgdGhpcy5ub3Rlc0luZGVudC5zbGljZSgwLCBmcm9tKSArIHRoaXMubm90ZXNJbmRlbnQuc2xpY2UodGlsbCk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkcmVuKSB7XG4gICAgICBjaGlsZC51bmluZGVudENvbnRlbnQoZnJvbSwgdGlsbCk7XG4gICAgfVxuICB9XG5cbiAgaW5kZW50Q29udGVudChpbmRlbnRQb3M6IG51bWJlciwgaW5kZW50Q2hhcnM6IHN0cmluZykge1xuICAgIHRoaXMuaW5kZW50ID1cbiAgICAgIHRoaXMuaW5kZW50LnNsaWNlKDAsIGluZGVudFBvcykgK1xuICAgICAgaW5kZW50Q2hhcnMgK1xuICAgICAgdGhpcy5pbmRlbnQuc2xpY2UoaW5kZW50UG9zKTtcbiAgICBpZiAodGhpcy5ub3Rlc0luZGVudCAhPT0gbnVsbCkge1xuICAgICAgdGhpcy5ub3Rlc0luZGVudCA9XG4gICAgICAgIHRoaXMubm90ZXNJbmRlbnQuc2xpY2UoMCwgaW5kZW50UG9zKSArXG4gICAgICAgIGluZGVudENoYXJzICtcbiAgICAgICAgdGhpcy5ub3Rlc0luZGVudC5zbGljZShpbmRlbnRQb3MpO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZHJlbikge1xuICAgICAgY2hpbGQuaW5kZW50Q29udGVudChpbmRlbnRQb3MsIGluZGVudENoYXJzKTtcbiAgICB9XG4gIH1cblxuICBnZXRGaXJzdExpbmVJbmRlbnQoKSB7XG4gICAgcmV0dXJuIHRoaXMuaW5kZW50O1xuICB9XG5cbiAgZ2V0QnVsbGV0KCkge1xuICAgIHJldHVybiB0aGlzLmJ1bGxldDtcbiAgfVxuXG4gIGdldFNwYWNlQWZ0ZXJCdWxsZXQoKSB7XG4gICAgcmV0dXJuIHRoaXMuc3BhY2VBZnRlckJ1bGxldDtcbiAgfVxuXG4gIHJlcGxhdGVCdWxsZXQoYnVsbGV0OiBzdHJpbmcpIHtcbiAgICB0aGlzLmJ1bGxldCA9IGJ1bGxldDtcbiAgfVxuXG4gIGdldFBhcmVudCgpIHtcbiAgICByZXR1cm4gdGhpcy5wYXJlbnQ7XG4gIH1cblxuICBhZGRCZWZvcmVBbGwobGlzdDogTGlzdCkge1xuICAgIHRoaXMuY2hpbGRyZW4udW5zaGlmdChsaXN0KTtcbiAgICBsaXN0LnBhcmVudCA9IHRoaXM7XG4gIH1cblxuICBhZGRBZnRlckFsbChsaXN0OiBMaXN0KSB7XG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKGxpc3QpO1xuICAgIGxpc3QucGFyZW50ID0gdGhpcztcbiAgfVxuXG4gIHJlbW92ZUNoaWxkKGxpc3Q6IExpc3QpIHtcbiAgICBjb25zdCBpID0gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGxpc3QpO1xuICAgIHRoaXMuY2hpbGRyZW4uc3BsaWNlKGksIDEpO1xuICAgIGxpc3QucGFyZW50ID0gbnVsbDtcbiAgfVxuXG4gIGFkZEJlZm9yZShiZWZvcmU6IExpc3QsIGxpc3Q6IExpc3QpIHtcbiAgICBjb25zdCBpID0gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGJlZm9yZSk7XG4gICAgdGhpcy5jaGlsZHJlbi5zcGxpY2UoaSwgMCwgbGlzdCk7XG4gICAgbGlzdC5wYXJlbnQgPSB0aGlzO1xuICB9XG5cbiAgYWRkQWZ0ZXIoYmVmb3JlOiBMaXN0LCBsaXN0OiBMaXN0KSB7XG4gICAgY29uc3QgaSA9IHRoaXMuY2hpbGRyZW4uaW5kZXhPZihiZWZvcmUpO1xuICAgIHRoaXMuY2hpbGRyZW4uc3BsaWNlKGkgKyAxLCAwLCBsaXN0KTtcbiAgICBsaXN0LnBhcmVudCA9IHRoaXM7XG4gIH1cblxuICBnZXRQcmV2U2libGluZ09mKGxpc3Q6IExpc3QpIHtcbiAgICBjb25zdCBpID0gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGxpc3QpO1xuICAgIHJldHVybiBpID4gMCA/IHRoaXMuY2hpbGRyZW5baSAtIDFdIDogbnVsbDtcbiAgfVxuXG4gIGdldE5leHRTaWJsaW5nT2YobGlzdDogTGlzdCkge1xuICAgIGNvbnN0IGkgPSB0aGlzLmNoaWxkcmVuLmluZGV4T2YobGlzdCk7XG4gICAgcmV0dXJuIGkgPj0gMCAmJiBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGggPyB0aGlzLmNoaWxkcmVuW2kgKyAxXSA6IG51bGw7XG4gIH1cblxuICBpc0VtcHR5KCkge1xuICAgIHJldHVybiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMDtcbiAgfVxuXG4gIHByaW50KCkge1xuICAgIGxldCByZXMgPSBcIlwiO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICByZXMgKz1cbiAgICAgICAgaSA9PT0gMFxuICAgICAgICAgID8gdGhpcy5pbmRlbnQgKyB0aGlzLmJ1bGxldCArIHRoaXMuc3BhY2VBZnRlckJ1bGxldFxuICAgICAgICAgIDogdGhpcy5ub3Rlc0luZGVudDtcbiAgICAgIHJlcyArPSB0aGlzLmxpbmVzW2ldO1xuICAgICAgcmVzICs9IFwiXFxuXCI7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkcmVuKSB7XG4gICAgICByZXMgKz0gY2hpbGQucHJpbnQoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBSb290IHtcbiAgcHJpdmF0ZSByb290TGlzdCA9IG5ldyBMaXN0KHRoaXMsIFwiXCIsIFwiXCIsIFwiXCIsIFwiXCIsIGZhbHNlKTtcbiAgcHJpdmF0ZSBzZWxlY3Rpb25zOiBSYW5nZVtdID0gW107XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBzdGFydDogUG9zaXRpb24sXG4gICAgcHJpdmF0ZSBlbmQ6IFBvc2l0aW9uLFxuICAgIHNlbGVjdGlvbnM6IFJhbmdlW11cbiAgKSB7XG4gICAgdGhpcy5yZXBsYWNlU2VsZWN0aW9ucyhzZWxlY3Rpb25zKTtcbiAgfVxuXG4gIGdldFJvb3RMaXN0KCkge1xuICAgIHJldHVybiB0aGlzLnJvb3RMaXN0O1xuICB9XG5cbiAgZ2V0UmFuZ2UoKTogW1Bvc2l0aW9uLCBQb3NpdGlvbl0ge1xuICAgIHJldHVybiBbeyAuLi50aGlzLnN0YXJ0IH0sIHsgLi4udGhpcy5lbmQgfV07XG4gIH1cblxuICBnZXRTZWxlY3Rpb25zKCk6IFJhbmdlW10ge1xuICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbnMubWFwKChzKSA9PiAoe1xuICAgICAgYW5jaG9yOiB7IC4uLnMuYW5jaG9yIH0sXG4gICAgICBoZWFkOiB7IC4uLnMuaGVhZCB9LFxuICAgIH0pKTtcbiAgfVxuXG4gIGhhc1NpbmdsZUN1cnNvcigpIHtcbiAgICBpZiAoIXRoaXMuaGFzU2luZ2xlU2VsZWN0aW9uKCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbnNbMF07XG5cbiAgICByZXR1cm4gKFxuICAgICAgc2VsZWN0aW9uLmFuY2hvci5saW5lID09PSBzZWxlY3Rpb24uaGVhZC5saW5lICYmXG4gICAgICBzZWxlY3Rpb24uYW5jaG9yLmNoID09PSBzZWxlY3Rpb24uaGVhZC5jaFxuICAgICk7XG4gIH1cblxuICBoYXNTaW5nbGVTZWxlY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9ucy5sZW5ndGggPT09IDE7XG4gIH1cblxuICBnZXRDdXJzb3IoKSB7XG4gICAgcmV0dXJuIHsgLi4udGhpcy5zZWxlY3Rpb25zW3RoaXMuc2VsZWN0aW9ucy5sZW5ndGggLSAxXS5oZWFkIH07XG4gIH1cblxuICByZXBsYWNlQ3Vyc29yKGN1cnNvcjogUG9zaXRpb24pIHtcbiAgICB0aGlzLnNlbGVjdGlvbnMgPSBbeyBhbmNob3I6IGN1cnNvciwgaGVhZDogY3Vyc29yIH1dO1xuICB9XG5cbiAgcmVwbGFjZVNlbGVjdGlvbnMoc2VsZWN0aW9uczogUmFuZ2VbXSkge1xuICAgIGlmIChzZWxlY3Rpb25zLmxlbmd0aCA8IDEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGNyZWF0ZSBSb290IHdpdGhvdXQgc2VsZWN0aW9uc2ApO1xuICAgIH1cbiAgICB0aGlzLnNlbGVjdGlvbnMgPSBzZWxlY3Rpb25zO1xuICB9XG5cbiAgZ2V0TGlzdFVuZGVyQ3Vyc29yKCk6IExpc3Qge1xuICAgIHJldHVybiB0aGlzLmdldExpc3RVbmRlckxpbmUodGhpcy5nZXRDdXJzb3IoKS5saW5lKTtcbiAgfVxuXG4gIGdldExpc3RVbmRlckxpbmUobGluZTogbnVtYmVyKSB7XG4gICAgaWYgKGxpbmUgPCB0aGlzLnN0YXJ0LmxpbmUgfHwgbGluZSA+IHRoaXMuZW5kLmxpbmUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgcmVzdWx0OiBMaXN0ID0gbnVsbDtcbiAgICBsZXQgaW5kZXg6IG51bWJlciA9IHRoaXMuc3RhcnQubGluZTtcblxuICAgIGNvbnN0IHZpc2l0QXJyID0gKGxsOiBMaXN0W10pID0+IHtcbiAgICAgIGZvciAoY29uc3QgbCBvZiBsbCkge1xuICAgICAgICBjb25zdCBsaXN0RnJvbUxpbmUgPSBpbmRleDtcbiAgICAgICAgY29uc3QgbGlzdFRpbGxMaW5lID0gbGlzdEZyb21MaW5lICsgbC5nZXRMaW5lQ291bnQoKSAtIDE7XG5cbiAgICAgICAgaWYgKGxpbmUgPj0gbGlzdEZyb21MaW5lICYmIGxpbmUgPD0gbGlzdFRpbGxMaW5lKSB7XG4gICAgICAgICAgcmVzdWx0ID0gbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbmRleCA9IGxpc3RUaWxsTGluZSArIDE7XG4gICAgICAgICAgdmlzaXRBcnIobC5nZXRDaGlsZHJlbigpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0ICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZpc2l0QXJyKHRoaXMucm9vdExpc3QuZ2V0Q2hpbGRyZW4oKSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgZ2V0Q29udGVudExpbmVzUmFuZ2VPZihsaXN0OiBMaXN0KTogW251bWJlciwgbnVtYmVyXSB8IG51bGwge1xuICAgIGxldCByZXN1bHQ6IFtudW1iZXIsIG51bWJlcl0gfCBudWxsID0gbnVsbDtcbiAgICBsZXQgbGluZTogbnVtYmVyID0gdGhpcy5zdGFydC5saW5lO1xuXG4gICAgY29uc3QgdmlzaXRBcnIgPSAobGw6IExpc3RbXSkgPT4ge1xuICAgICAgZm9yIChjb25zdCBsIG9mIGxsKSB7XG4gICAgICAgIGNvbnN0IGxpc3RGcm9tTGluZSA9IGxpbmU7XG4gICAgICAgIGNvbnN0IGxpc3RUaWxsTGluZSA9IGxpc3RGcm9tTGluZSArIGwuZ2V0TGluZUNvdW50KCkgLSAxO1xuXG4gICAgICAgIGlmIChsID09PSBsaXN0KSB7XG4gICAgICAgICAgcmVzdWx0ID0gW2xpc3RGcm9tTGluZSwgbGlzdFRpbGxMaW5lXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsaW5lID0gbGlzdFRpbGxMaW5lICsgMTtcbiAgICAgICAgICB2aXNpdEFycihsLmdldENoaWxkcmVuKCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJlc3VsdCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICB2aXNpdEFycih0aGlzLnJvb3RMaXN0LmdldENoaWxkcmVuKCkpO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGdldENoaWxkcmVuKCkge1xuICAgIHJldHVybiB0aGlzLnJvb3RMaXN0LmdldENoaWxkcmVuKCk7XG4gIH1cblxuICBwcmludCgpIHtcbiAgICBsZXQgcmVzID0gXCJcIjtcblxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5yb290TGlzdC5nZXRDaGlsZHJlbigpKSB7XG4gICAgICByZXMgKz0gY2hpbGQucHJpbnQoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzLnJlcGxhY2UoL1xcbiQvLCBcIlwiKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgT3BlcmF0aW9uIH0gZnJvbSBcIi4vT3BlcmF0aW9uXCI7XG5cbmltcG9ydCB7IExpc3QsIFJvb3QgfSBmcm9tIFwiLi4vcm9vdFwiO1xuaW1wb3J0IHsgcmVjYWxjdWxhdGVOdW1lcmljQnVsbGV0cyB9IGZyb20gXCIuLi9yb290L3JlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHNcIjtcbmltcG9ydCB7IGlzRW1wdHlMaW5lT3JFbXB0eUNoZWNrYm94IH0gZnJvbSBcIi4uL3V0aWxzL2lzRW1wdHlMaW5lT3JFbXB0eUNoZWNrYm94XCI7XG5cbmV4cG9ydCBjbGFzcyBDcmVhdGVOZXdJdGVtT3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgbGluZXMgPSBsaXN0LmdldExpbmVzSW5mbygpO1xuXG4gICAgaWYgKGxpbmVzLmxlbmd0aCA9PT0gMSAmJiBpc0VtcHR5TGluZU9yRW1wdHlDaGVja2JveChsaW5lc1swXS50ZXh0KSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGN1cnNvciA9IHJvb3QuZ2V0Q3Vyc29yKCk7XG4gICAgY29uc3QgbGluZVVuZGVyQ3Vyc29yID0gbGluZXMuZmluZCgobCkgPT4gbC5mcm9tLmxpbmUgPT09IGN1cnNvci5saW5lKTtcblxuICAgIGlmIChjdXJzb3IuY2ggPCBsaW5lVW5kZXJDdXJzb3IuZnJvbS5jaCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHsgb2xkTGluZXMsIG5ld0xpbmVzIH0gPSBsaW5lcy5yZWR1Y2UoXG4gICAgICAoYWNjLCBsaW5lKSA9PiB7XG4gICAgICAgIGlmIChjdXJzb3IubGluZSA+IGxpbmUuZnJvbS5saW5lKSB7XG4gICAgICAgICAgYWNjLm9sZExpbmVzLnB1c2gobGluZS50ZXh0KTtcbiAgICAgICAgfSBlbHNlIGlmIChjdXJzb3IubGluZSA9PT0gbGluZS5mcm9tLmxpbmUpIHtcbiAgICAgICAgICBjb25zdCBhID0gbGluZS50ZXh0LnNsaWNlKDAsIGN1cnNvci5jaCAtIGxpbmUuZnJvbS5jaCk7XG4gICAgICAgICAgY29uc3QgYiA9IGxpbmUudGV4dC5zbGljZShjdXJzb3IuY2ggLSBsaW5lLmZyb20uY2gpO1xuICAgICAgICAgIGFjYy5vbGRMaW5lcy5wdXNoKGEpO1xuICAgICAgICAgIGFjYy5uZXdMaW5lcy5wdXNoKGIpO1xuICAgICAgICB9IGVsc2UgaWYgKGN1cnNvci5saW5lIDwgbGluZS5mcm9tLmxpbmUpIHtcbiAgICAgICAgICBhY2MubmV3TGluZXMucHVzaChsaW5lLnRleHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG9sZExpbmVzOiBbXSxcbiAgICAgICAgbmV3TGluZXM6IFtdLFxuICAgICAgfVxuICAgICk7XG5cbiAgICBjb25zdCBjb2RlQmxvY2tCYWN0aWNrcyA9IG9sZExpbmVzLmpvaW4oXCJcXG5cIikuc3BsaXQoXCJgYGBcIikubGVuZ3RoIC0gMTtcbiAgICBjb25zdCBpc0luc2lkZUNvZGVibG9jayA9XG4gICAgICBjb2RlQmxvY2tCYWN0aWNrcyA+IDAgJiYgY29kZUJsb2NrQmFjdGlja3MgJSAyICE9PSAwO1xuXG4gICAgaWYgKGlzSW5zaWRlQ29kZWJsb2NrKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuICAgIHRoaXMudXBkYXRlZCA9IHRydWU7XG5cbiAgICBjb25zdCBlbmRQb3MgPSBsaXN0LmdldExhc3RMaW5lQ29udGVudEVuZCgpO1xuICAgIGNvbnN0IG9uQ2hpbGRMZXZlbCA9XG4gICAgICAhbGlzdC5pc0VtcHR5KCkgJiYgY3Vyc29yLmxpbmUgPT09IGVuZFBvcy5saW5lICYmIGN1cnNvci5jaCA9PT0gZW5kUG9zLmNoO1xuXG4gICAgY29uc3QgaW5kZW50ID0gb25DaGlsZExldmVsXG4gICAgICA/IGxpc3QuZ2V0Q2hpbGRyZW4oKVswXS5nZXRGaXJzdExpbmVJbmRlbnQoKVxuICAgICAgOiBsaXN0LmdldEZpcnN0TGluZUluZGVudCgpO1xuXG4gICAgY29uc3QgYnVsbGV0ID0gb25DaGlsZExldmVsXG4gICAgICA/IGxpc3QuZ2V0Q2hpbGRyZW4oKVswXS5nZXRCdWxsZXQoKVxuICAgICAgOiBsaXN0LmdldEJ1bGxldCgpO1xuXG4gICAgY29uc3Qgc3BhY2VBZnRlckJ1bGxldCA9IG9uQ2hpbGRMZXZlbFxuICAgICAgPyBsaXN0LmdldENoaWxkcmVuKClbMF0uZ2V0U3BhY2VBZnRlckJ1bGxldCgpXG4gICAgICA6IGxpc3QuZ2V0U3BhY2VBZnRlckJ1bGxldCgpO1xuXG4gICAgY29uc3QgcHJlZml4ID0gb2xkTGluZXNbMF0ubWF0Y2goL15cXFtbIHhdXFxdLykgPyBcIlsgXSBcIiA6IFwiXCI7XG5cbiAgICBjb25zdCBuZXdMaXN0ID0gbmV3IExpc3QoXG4gICAgICBsaXN0LmdldFJvb3QoKSxcbiAgICAgIGluZGVudCxcbiAgICAgIGJ1bGxldCxcbiAgICAgIHNwYWNlQWZ0ZXJCdWxsZXQsXG4gICAgICBwcmVmaXggKyBuZXdMaW5lcy5zaGlmdCgpLFxuICAgICAgZmFsc2VcbiAgICApO1xuXG4gICAgaWYgKG5ld0xpbmVzLmxlbmd0aCA+IDApIHtcbiAgICAgIG5ld0xpc3Quc2V0Tm90ZXNJbmRlbnQobGlzdC5nZXROb3Rlc0luZGVudCgpKTtcbiAgICAgIGZvciAoY29uc3QgbGluZSBvZiBuZXdMaW5lcykge1xuICAgICAgICBuZXdMaXN0LmFkZExpbmUobGluZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG9uQ2hpbGRMZXZlbCkge1xuICAgICAgbGlzdC5hZGRCZWZvcmVBbGwobmV3TGlzdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGNoaWxkcmVuID0gbGlzdC5nZXRDaGlsZHJlbigpO1xuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICBsaXN0LnJlbW92ZUNoaWxkKGNoaWxkKTtcbiAgICAgICAgbmV3TGlzdC5hZGRBZnRlckFsbChjaGlsZCk7XG4gICAgICB9XG5cbiAgICAgIGxpc3QuZ2V0UGFyZW50KCkuYWRkQWZ0ZXIobGlzdCwgbmV3TGlzdCk7XG4gICAgfVxuXG4gICAgbGlzdC5yZXBsYWNlTGluZXMob2xkTGluZXMpO1xuXG4gICAgY29uc3QgbmV3TGlzdFN0YXJ0ID0gbmV3TGlzdC5nZXRGaXJzdExpbmVDb250ZW50U3RhcnQoKTtcbiAgICByb290LnJlcGxhY2VDdXJzb3Ioe1xuICAgICAgbGluZTogbmV3TGlzdFN0YXJ0LmxpbmUsXG4gICAgICBjaDogbmV3TGlzdFN0YXJ0LmNoICsgcHJlZml4Lmxlbmd0aCxcbiAgICB9KTtcblxuICAgIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMocm9vdCk7XG4gIH1cbn1cbiIsImltcG9ydCB7IFBsdWdpbl8yIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IFByZWMgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IGtleW1hcCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL015RWRpdG9yXCI7XG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4uL2ZlYXR1cmVzL0ZlYXR1cmVcIjtcbmltcG9ydCB7IENyZWF0ZU5ld0l0ZW1PcGVyYXRpb24gfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9DcmVhdGVOZXdJdGVtT3BlcmF0aW9uXCI7XG5pbXBvcnQgeyBJTUVTZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL0lNRVNlcnZpY2VcIjtcbmltcG9ydCB7IE9ic2lkaWFuU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PYnNpZGlhblNlcnZpY2VcIjtcbmltcG9ydCB7IFBlcmZvcm1PcGVyYXRpb25TZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1BlcmZvcm1PcGVyYXRpb25TZXJ2aWNlXCI7XG5pbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBjbGFzcyBFbnRlclNob3VsZENyZWF0ZU5ld0l0ZW1GZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW5fMixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UsXG4gICAgcHJpdmF0ZSBpbWU6IElNRVNlcnZpY2UsXG4gICAgcHJpdmF0ZSBvYnNpZGlhbjogT2JzaWRpYW5TZXJ2aWNlLFxuICAgIHByaXZhdGUgcGVyZm9ybU9wZXJhdGlvbjogUGVyZm9ybU9wZXJhdGlvblNlcnZpY2VcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBQcmVjLmhpZ2hlc3QoXG4gICAgICAgIGtleW1hcC5vZihbXG4gICAgICAgICAge1xuICAgICAgICAgICAga2V5OiBcIkVudGVyXCIsXG4gICAgICAgICAgICBydW46IHRoaXMub2JzaWRpYW4uY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2soe1xuICAgICAgICAgICAgICBjaGVjazogdGhpcy5jaGVjayxcbiAgICAgICAgICAgICAgcnVuOiB0aGlzLnJ1bixcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG5cbiAgcHJpdmF0ZSBjaGVjayA9ICgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5iZXR0ZXJFbnRlciAmJiAhdGhpcy5pbWUuaXNJTUVPcGVuZWQoKTtcbiAgfTtcblxuICBwcml2YXRlIHJ1biA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMucGVyZm9ybU9wZXJhdGlvbi5wZXJmb3JtT3BlcmF0aW9uKFxuICAgICAgKHJvb3QpID0+IG5ldyBDcmVhdGVOZXdJdGVtT3BlcmF0aW9uKHJvb3QpLFxuICAgICAgZWRpdG9yXG4gICAgKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IE5vdGljZSwgUGx1Z2luXzIgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuL0ZlYXR1cmVcIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vTXlFZGl0b3JcIjtcbmltcG9ydCB7IE9ic2lkaWFuU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PYnNpZGlhblNlcnZpY2VcIjtcblxuZXhwb3J0IGNsYXNzIEZvbGRGZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcGx1Z2luOiBQbHVnaW5fMiwgcHJpdmF0ZSBvYnNpZGlhbjogT2JzaWRpYW5TZXJ2aWNlKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4uYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJmb2xkXCIsXG4gICAgICBuYW1lOiBcIkZvbGQgdGhlIGxpc3RcIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiB0aGlzLm9ic2lkaWFuLmNyZWF0ZUVkaXRvckNhbGxiYWNrKHRoaXMuZm9sZCksXG4gICAgICBob3RrZXlzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBtb2RpZmllcnM6IFtcIk1vZFwiXSxcbiAgICAgICAgICBrZXk6IFwiQXJyb3dVcFwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIHRoaXMucGx1Z2luLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidW5mb2xkXCIsXG4gICAgICBuYW1lOiBcIlVuZm9sZCB0aGUgbGlzdFwiLFxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IHRoaXMub2JzaWRpYW4uY3JlYXRlRWRpdG9yQ2FsbGJhY2sodGhpcy51bmZvbGQpLFxuICAgICAgaG90a2V5czogW1xuICAgICAgICB7XG4gICAgICAgICAgbW9kaWZpZXJzOiBbXCJNb2RcIl0sXG4gICAgICAgICAga2V5OiBcIkFycm93RG93blwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG5cbiAgcHJpdmF0ZSBzZXRGb2xkKGVkaXRvcjogTXlFZGl0b3IsIHR5cGU6IFwiZm9sZFwiIHwgXCJ1bmZvbGRcIikge1xuICAgIGlmICghdGhpcy5vYnNpZGlhbi5nZXRPYnNpZGlhbkZvbGRTZXR0aW5ncygpLmZvbGRJbmRlbnQpIHtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIGBVbmFibGUgdG8gJHt0eXBlfSBiZWNhdXNlIGZvbGRpbmcgaXMgZGlzYWJsZWQuIFBsZWFzZSBlbmFibGUgXCJGb2xkIGluZGVudFwiIGluIE9ic2lkaWFuIHNldHRpbmdzLmAsXG4gICAgICAgIDUwMDBcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBjb25zdCBjdXJzb3IgPSBlZGl0b3IuZ2V0Q3Vyc29yKCk7XG5cbiAgICBpZiAodHlwZSA9PT0gXCJmb2xkXCIpIHtcbiAgICAgIGVkaXRvci5mb2xkKGN1cnNvci5saW5lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZWRpdG9yLnVuZm9sZChjdXJzb3IubGluZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGZvbGQgPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLnNldEZvbGQoZWRpdG9yLCBcImZvbGRcIik7XG4gIH07XG5cbiAgcHJpdmF0ZSB1bmZvbGQgPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLnNldEZvbGQoZWRpdG9yLCBcInVuZm9sZFwiKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE9ic2lkaWFuU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PYnNpZGlhblNlcnZpY2VcIjtcbmltcG9ydCB7IFNldHRpbmdzU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1NlcnZpY2VcIjtcblxuY29uc3QgQkVUVEVSX0xJU1RTX0NMQVNTID0gXCJvdXRsaW5lci1wbHVnaW4tYmV0dGVyLWxpc3RzXCI7XG5jb25zdCBCRVRURVJfQlVMTEVUU19DTEFTUyA9IFwib3V0bGluZXItcGx1Z2luLWJldHRlci1idWxsZXRzXCI7XG5jb25zdCBWRVJUSUNBTF9MSU5FU19DTEFTUyA9IFwib3V0bGluZXItcGx1Z2luLXZlcnRpY2FsLWxpbmVzXCI7XG5jb25zdCBLTk9XTl9DTEFTU0VTID0gW1xuICBCRVRURVJfTElTVFNfQ0xBU1MsXG4gIEJFVFRFUl9CVUxMRVRTX0NMQVNTLFxuICBWRVJUSUNBTF9MSU5FU19DTEFTUyxcbl07XG5cbmV4cG9ydCBjbGFzcyBMaXN0c1N0eWxlc0ZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgcHJpdmF0ZSBpbnRlcnZhbDogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzU2VydmljZSxcbiAgICBwcml2YXRlIG9ic2lkaWFuOiBPYnNpZGlhblNlcnZpY2VcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5zeW5jTGlzdHNTdHlsZXMoKTtcbiAgICB0aGlzLmludGVydmFsID0gd2luZG93LnNldEludGVydmFsKCgpID0+IHtcbiAgICAgIHRoaXMuc3luY0xpc3RzU3R5bGVzKCk7XG4gICAgfSwgMTAwMCk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7XG4gICAgY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsKTtcbiAgICB0aGlzLmFwcGx5TGlzdHNTdHlsZXMoW10pO1xuICB9XG5cbiAgcHJpdmF0ZSBzeW5jTGlzdHNTdHlsZXMgPSAoKSA9PiB7XG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLnN0eWxlTGlzdHMgfHwgIXRoaXMub2JzaWRpYW4uaXNEZWZhdWx0VGhlbWVFbmFibGVkKCkpIHtcbiAgICAgIHRoaXMuYXBwbHlMaXN0c1N0eWxlcyhbXSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgeyB0YWJTaXplIH0gPSB0aGlzLm9ic2lkaWFuLmdldE9ic2lkaWFuVGFic1NldHRpbmdzKCk7XG5cbiAgICB0aGlzLmFwcGx5TGlzdHNTdHlsZXMoW1xuICAgICAgQkVUVEVSX0xJU1RTX0NMQVNTLFxuICAgICAgQkVUVEVSX0JVTExFVFNfQ0xBU1MsXG4gICAgICB0YWJTaXplID09PSA0ID8gVkVSVElDQUxfTElORVNfQ0xBU1MgOiBudWxsLFxuICAgIF0pO1xuICB9O1xuXG4gIHByaXZhdGUgYXBwbHlMaXN0c1N0eWxlcyhjbGFzc2VzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IHRvS2VlcCA9IGNsYXNzZXMuZmlsdGVyKChjKSA9PiBLTk9XTl9DTEFTU0VTLmNvbnRhaW5zKGMpKTtcbiAgICBjb25zdCB0b1JlbW92ZSA9IEtOT1dOX0NMQVNTRVMuZmlsdGVyKChjKSA9PiAhdG9LZWVwLmNvbnRhaW5zKGMpKTtcblxuICAgIGZvciAoY29uc3QgYyBvZiB0b0tlZXApIHtcbiAgICAgIGlmICghZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuY29udGFpbnMoYykpIHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKGMpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgYyBvZiB0b1JlbW92ZSkge1xuICAgICAgaWYgKGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKGMpKSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZShjKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiIsImltcG9ydCB7IE9wZXJhdGlvbiB9IGZyb20gXCIuL09wZXJhdGlvblwiO1xuXG5pbXBvcnQgeyBMaXN0TGluZSwgUG9zaXRpb24sIFJvb3QgfSBmcm9tIFwiLi4vcm9vdFwiO1xuXG5leHBvcnQgY2xhc3MgTW92ZUN1cnNvclRvUHJldmlvdXNVbmZvbGRlZExpbmVPcGVyYXRpb24gaW1wbGVtZW50cyBPcGVyYXRpb24ge1xuICBwcml2YXRlIHN0b3BQcm9wYWdhdGlvbiA9IGZhbHNlO1xuICBwcml2YXRlIHVwZGF0ZWQgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJvb3Q6IFJvb3QpIHt9XG5cbiAgc2hvdWxkU3RvcFByb3BhZ2F0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0b3BQcm9wYWdhdGlvbjtcbiAgfVxuXG4gIHNob3VsZFVwZGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVkO1xuICB9XG5cbiAgcGVyZm9ybSgpIHtcbiAgICBjb25zdCB7IHJvb3QgfSA9IHRoaXM7XG5cbiAgICBpZiAoIXJvb3QuaGFzU2luZ2xlQ3Vyc29yKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBsaXN0ID0gdGhpcy5yb290LmdldExpc3RVbmRlckN1cnNvcigpO1xuICAgIGNvbnN0IGN1cnNvciA9IHRoaXMucm9vdC5nZXRDdXJzb3IoKTtcbiAgICBjb25zdCBsaW5lcyA9IGxpc3QuZ2V0TGluZXNJbmZvKCk7XG4gICAgY29uc3QgbGluZU5vID0gbGluZXMuZmluZEluZGV4KFxuICAgICAgKGwpID0+IGN1cnNvci5jaCA9PT0gbC5mcm9tLmNoICYmIGN1cnNvci5saW5lID09PSBsLmZyb20ubGluZVxuICAgICk7XG5cbiAgICBpZiAobGluZU5vID09PSAwKSB7XG4gICAgICB0aGlzLm1vdmVDdXJzb3JUb1ByZXZpb3VzVW5mb2xkZWRJdGVtKHJvb3QsIGN1cnNvcik7XG4gICAgfSBlbHNlIGlmIChsaW5lTm8gPiAwKSB7XG4gICAgICB0aGlzLm1vdmVDdXJzb3JUb1ByZXZpb3VzTm90ZUxpbmUocm9vdCwgbGluZXMsIGxpbmVObyk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBtb3ZlQ3Vyc29yVG9QcmV2aW91c05vdGVMaW5lKFxuICAgIHJvb3Q6IFJvb3QsXG4gICAgbGluZXM6IExpc3RMaW5lW10sXG4gICAgbGluZU5vOiBudW1iZXJcbiAgKSB7XG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuICAgIHRoaXMudXBkYXRlZCA9IHRydWU7XG5cbiAgICByb290LnJlcGxhY2VDdXJzb3IobGluZXNbbGluZU5vIC0gMV0udG8pO1xuICB9XG5cbiAgcHJpdmF0ZSBtb3ZlQ3Vyc29yVG9QcmV2aW91c1VuZm9sZGVkSXRlbShyb290OiBSb290LCBjdXJzb3I6IFBvc2l0aW9uKSB7XG4gICAgY29uc3QgcHJldiA9IHJvb3QuZ2V0TGlzdFVuZGVyTGluZShjdXJzb3IubGluZSAtIDEpO1xuXG4gICAgaWYgKCFwcmV2KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuICAgIHRoaXMudXBkYXRlZCA9IHRydWU7XG5cbiAgICBpZiAocHJldi5pc0ZvbGRlZCgpKSB7XG4gICAgICBsZXQgZm9sZFJvb3QgPSBwcmV2O1xuICAgICAgd2hpbGUgKCFmb2xkUm9vdC5pc0ZvbGRSb290KCkpIHtcbiAgICAgICAgZm9sZFJvb3QgPSBmb2xkUm9vdC5nZXRQYXJlbnQoKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZmlyc3RMaW5lRW5kID0gZm9sZFJvb3QuZ2V0TGluZXNJbmZvKClbMF0udG87XG4gICAgICByb290LnJlcGxhY2VDdXJzb3IoZmlyc3RMaW5lRW5kKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcm9vdC5yZXBsYWNlQ3Vyc29yKHByZXYuZ2V0TGFzdExpbmVDb250ZW50RW5kKCkpO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgUGx1Z2luXzIgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsga2V5bWFwIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vTXlFZGl0b3JcIjtcbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi4vZmVhdHVyZXMvRmVhdHVyZVwiO1xuaW1wb3J0IHsgTW92ZUN1cnNvclRvUHJldmlvdXNVbmZvbGRlZExpbmVPcGVyYXRpb24gfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9Nb3ZlQ3Vyc29yVG9QcmV2aW91c1VuZm9sZGVkTGluZU9wZXJhdGlvblwiO1xuaW1wb3J0IHsgSU1FU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9JTUVTZXJ2aWNlXCI7XG5pbXBvcnQgeyBPYnNpZGlhblNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvT2JzaWRpYW5TZXJ2aWNlXCI7XG5pbXBvcnQgeyBQZXJmb3JtT3BlcmF0aW9uU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9QZXJmb3JtT3BlcmF0aW9uU2VydmljZVwiO1xuaW1wb3J0IHsgU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1NldHRpbmdzU2VydmljZVwiO1xuXG5leHBvcnQgY2xhc3MgTW92ZUN1cnNvclRvUHJldmlvdXNVbmZvbGRlZExpbmVGZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW5fMixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UsXG4gICAgcHJpdmF0ZSBpbWU6IElNRVNlcnZpY2UsXG4gICAgcHJpdmF0ZSBvYnNpZGlhbjogT2JzaWRpYW5TZXJ2aWNlLFxuICAgIHByaXZhdGUgcGVyZm9ybU9wZXJhdGlvbjogUGVyZm9ybU9wZXJhdGlvblNlcnZpY2VcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBrZXltYXAub2YoW1xuICAgICAgICB7XG4gICAgICAgICAga2V5OiBcIkFycm93TGVmdFwiLFxuICAgICAgICAgIHJ1bjogdGhpcy5vYnNpZGlhbi5jcmVhdGVLZXltYXBSdW5DYWxsYmFjayh7XG4gICAgICAgICAgICBjaGVjazogdGhpcy5jaGVjayxcbiAgICAgICAgICAgIHJ1bjogdGhpcy5ydW4sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICB3aW46IFwiYy1BcnJvd0xlZnRcIixcbiAgICAgICAgICBsaW51eDogXCJjLUFycm93TGVmdFwiLFxuICAgICAgICAgIHJ1bjogdGhpcy5vYnNpZGlhbi5jcmVhdGVLZXltYXBSdW5DYWxsYmFjayh7XG4gICAgICAgICAgICBjaGVjazogdGhpcy5jaGVjayxcbiAgICAgICAgICAgIHJ1bjogdGhpcy5ydW4sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICBdKVxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2hlY2sgPSAoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuc2V0dGluZ3Muc3RpY2tDdXJzb3IgJiYgIXRoaXMuaW1lLmlzSU1FT3BlbmVkKCk7XG4gIH07XG5cbiAgcHJpdmF0ZSBydW4gPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLnBlcmZvcm1PcGVyYXRpb24ucGVyZm9ybU9wZXJhdGlvbihcbiAgICAgIChyb290KSA9PiBuZXcgTW92ZUN1cnNvclRvUHJldmlvdXNVbmZvbGRlZExpbmVPcGVyYXRpb24ocm9vdCksXG4gICAgICBlZGl0b3JcbiAgICApO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgT3BlcmF0aW9uIH0gZnJvbSBcIi4vT3BlcmF0aW9uXCI7XG5cbmltcG9ydCB7IFJvb3QgfSBmcm9tIFwiLi4vcm9vdFwiO1xuaW1wb3J0IHsgcmVjYWxjdWxhdGVOdW1lcmljQnVsbGV0cyB9IGZyb20gXCIuLi9yb290L3JlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHNcIjtcblxuZXhwb3J0IGNsYXNzIE1vdmVEb3duT3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgcGFyZW50ID0gbGlzdC5nZXRQYXJlbnQoKTtcbiAgICBjb25zdCBncmFuZFBhcmVudCA9IHBhcmVudC5nZXRQYXJlbnQoKTtcbiAgICBjb25zdCBuZXh0ID0gcGFyZW50LmdldE5leHRTaWJsaW5nT2YobGlzdCk7XG5cbiAgICBjb25zdCBsaXN0U3RhcnRMaW5lQmVmb3JlID0gcm9vdC5nZXRDb250ZW50TGluZXNSYW5nZU9mKGxpc3QpWzBdO1xuXG4gICAgaWYgKCFuZXh0ICYmIGdyYW5kUGFyZW50KSB7XG4gICAgICBjb25zdCBuZXdQYXJlbnQgPSBncmFuZFBhcmVudC5nZXROZXh0U2libGluZ09mKHBhcmVudCk7XG5cbiAgICAgIGlmIChuZXdQYXJlbnQpIHtcbiAgICAgICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcbiAgICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKGxpc3QpO1xuICAgICAgICBuZXdQYXJlbnQuYWRkQmVmb3JlQWxsKGxpc3QpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAobmV4dCkge1xuICAgICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcbiAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChsaXN0KTtcbiAgICAgIHBhcmVudC5hZGRBZnRlcihuZXh0LCBsaXN0KTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMudXBkYXRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGxpc3RTdGFydExpbmVBZnRlciA9IHJvb3QuZ2V0Q29udGVudExpbmVzUmFuZ2VPZihsaXN0KVswXTtcbiAgICBjb25zdCBsaW5lRGlmZiA9IGxpc3RTdGFydExpbmVBZnRlciAtIGxpc3RTdGFydExpbmVCZWZvcmU7XG5cbiAgICBjb25zdCBjdXJzb3IgPSByb290LmdldEN1cnNvcigpO1xuICAgIHJvb3QucmVwbGFjZUN1cnNvcih7XG4gICAgICBsaW5lOiBjdXJzb3IubGluZSArIGxpbmVEaWZmLFxuICAgICAgY2g6IGN1cnNvci5jaCxcbiAgICB9KTtcblxuICAgIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMocm9vdCk7XG4gIH1cbn1cbiIsImltcG9ydCB7IE9wZXJhdGlvbiB9IGZyb20gXCIuL09wZXJhdGlvblwiO1xuXG5pbXBvcnQgeyBSb290IH0gZnJvbSBcIi4uL3Jvb3RcIjtcbmltcG9ydCB7IHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMgfSBmcm9tIFwiLi4vcm9vdC9yZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzXCI7XG5cbmV4cG9ydCBjbGFzcyBNb3ZlUmlnaHRPcGVyYXRpb24gaW1wbGVtZW50cyBPcGVyYXRpb24ge1xuICBwcml2YXRlIHN0b3BQcm9wYWdhdGlvbiA9IGZhbHNlO1xuICBwcml2YXRlIHVwZGF0ZWQgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJvb3Q6IFJvb3QsIHByaXZhdGUgZGVmYXVsdEluZGVudENoYXJzOiBzdHJpbmcpIHt9XG5cbiAgc2hvdWxkU3RvcFByb3BhZ2F0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0b3BQcm9wYWdhdGlvbjtcbiAgfVxuXG4gIHNob3VsZFVwZGF0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVkO1xuICB9XG5cbiAgcGVyZm9ybSgpIHtcbiAgICBjb25zdCB7IHJvb3QgfSA9IHRoaXM7XG5cbiAgICBpZiAoIXJvb3QuaGFzU2luZ2xlQ3Vyc29yKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbiA9IHRydWU7XG5cbiAgICBjb25zdCBsaXN0ID0gcm9vdC5nZXRMaXN0VW5kZXJDdXJzb3IoKTtcbiAgICBjb25zdCBwYXJlbnQgPSBsaXN0LmdldFBhcmVudCgpO1xuICAgIGNvbnN0IHByZXYgPSBwYXJlbnQuZ2V0UHJldlNpYmxpbmdPZihsaXN0KTtcblxuICAgIGlmICghcHJldikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMudXBkYXRlZCA9IHRydWU7XG5cbiAgICBjb25zdCBsaXN0U3RhcnRMaW5lQmVmb3JlID0gcm9vdC5nZXRDb250ZW50TGluZXNSYW5nZU9mKGxpc3QpWzBdO1xuXG4gICAgY29uc3QgaW5kZW50UG9zID0gbGlzdC5nZXRGaXJzdExpbmVJbmRlbnQoKS5sZW5ndGg7XG4gICAgbGV0IGluZGVudENoYXJzID0gXCJcIjtcblxuICAgIGlmIChpbmRlbnRDaGFycyA9PT0gXCJcIiAmJiAhcHJldi5pc0VtcHR5KCkpIHtcbiAgICAgIGluZGVudENoYXJzID0gcHJldlxuICAgICAgICAuZ2V0Q2hpbGRyZW4oKVswXVxuICAgICAgICAuZ2V0Rmlyc3RMaW5lSW5kZW50KClcbiAgICAgICAgLnNsaWNlKHByZXYuZ2V0Rmlyc3RMaW5lSW5kZW50KCkubGVuZ3RoKTtcbiAgICB9XG5cbiAgICBpZiAoaW5kZW50Q2hhcnMgPT09IFwiXCIpIHtcbiAgICAgIGluZGVudENoYXJzID0gbGlzdFxuICAgICAgICAuZ2V0Rmlyc3RMaW5lSW5kZW50KClcbiAgICAgICAgLnNsaWNlKHBhcmVudC5nZXRGaXJzdExpbmVJbmRlbnQoKS5sZW5ndGgpO1xuICAgIH1cblxuICAgIGlmIChpbmRlbnRDaGFycyA9PT0gXCJcIiAmJiAhbGlzdC5pc0VtcHR5KCkpIHtcbiAgICAgIGluZGVudENoYXJzID0gbGlzdC5nZXRDaGlsZHJlbigpWzBdLmdldEZpcnN0TGluZUluZGVudCgpO1xuICAgIH1cblxuICAgIGlmIChpbmRlbnRDaGFycyA9PT0gXCJcIikge1xuICAgICAgaW5kZW50Q2hhcnMgPSB0aGlzLmRlZmF1bHRJbmRlbnRDaGFycztcbiAgICB9XG5cbiAgICBwYXJlbnQucmVtb3ZlQ2hpbGQobGlzdCk7XG4gICAgcHJldi5hZGRBZnRlckFsbChsaXN0KTtcbiAgICBsaXN0LmluZGVudENvbnRlbnQoaW5kZW50UG9zLCBpbmRlbnRDaGFycyk7XG5cbiAgICBjb25zdCBsaXN0U3RhcnRMaW5lQWZ0ZXIgPSByb290LmdldENvbnRlbnRMaW5lc1JhbmdlT2YobGlzdClbMF07XG4gICAgY29uc3QgbGluZURpZmYgPSBsaXN0U3RhcnRMaW5lQWZ0ZXIgLSBsaXN0U3RhcnRMaW5lQmVmb3JlO1xuXG4gICAgY29uc3QgY3Vyc29yID0gcm9vdC5nZXRDdXJzb3IoKTtcbiAgICByb290LnJlcGxhY2VDdXJzb3Ioe1xuICAgICAgbGluZTogY3Vyc29yLmxpbmUgKyBsaW5lRGlmZixcbiAgICAgIGNoOiBjdXJzb3IuY2ggKyBpbmRlbnRDaGFycy5sZW5ndGgsXG4gICAgfSk7XG5cbiAgICByZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzKHJvb3QpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5pbXBvcnQgeyByZWNhbGN1bGF0ZU51bWVyaWNCdWxsZXRzIH0gZnJvbSBcIi4uL3Jvb3QvcmVjYWxjdWxhdGVOdW1lcmljQnVsbGV0c1wiO1xuXG5leHBvcnQgY2xhc3MgTW92ZVVwT3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuXG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgcGFyZW50ID0gbGlzdC5nZXRQYXJlbnQoKTtcbiAgICBjb25zdCBncmFuZFBhcmVudCA9IHBhcmVudC5nZXRQYXJlbnQoKTtcbiAgICBjb25zdCBwcmV2ID0gcGFyZW50LmdldFByZXZTaWJsaW5nT2YobGlzdCk7XG5cbiAgICBjb25zdCBsaXN0U3RhcnRMaW5lQmVmb3JlID0gcm9vdC5nZXRDb250ZW50TGluZXNSYW5nZU9mKGxpc3QpWzBdO1xuXG4gICAgaWYgKCFwcmV2ICYmIGdyYW5kUGFyZW50KSB7XG4gICAgICBjb25zdCBuZXdQYXJlbnQgPSBncmFuZFBhcmVudC5nZXRQcmV2U2libGluZ09mKHBhcmVudCk7XG5cbiAgICAgIGlmIChuZXdQYXJlbnQpIHtcbiAgICAgICAgdGhpcy51cGRhdGVkID0gdHJ1ZTtcbiAgICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKGxpc3QpO1xuICAgICAgICBuZXdQYXJlbnQuYWRkQWZ0ZXJBbGwobGlzdCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChwcmV2KSB7XG4gICAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKGxpc3QpO1xuICAgICAgcGFyZW50LmFkZEJlZm9yZShwcmV2LCBsaXN0KTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMudXBkYXRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGxpc3RTdGFydExpbmVBZnRlciA9IHJvb3QuZ2V0Q29udGVudExpbmVzUmFuZ2VPZihsaXN0KVswXTtcbiAgICBjb25zdCBsaW5lRGlmZiA9IGxpc3RTdGFydExpbmVBZnRlciAtIGxpc3RTdGFydExpbmVCZWZvcmU7XG5cbiAgICBjb25zdCBjdXJzb3IgPSByb290LmdldEN1cnNvcigpO1xuICAgIHJvb3QucmVwbGFjZUN1cnNvcih7XG4gICAgICBsaW5lOiBjdXJzb3IubGluZSArIGxpbmVEaWZmLFxuICAgICAgY2g6IGN1cnNvci5jaCxcbiAgICB9KTtcblxuICAgIHJlY2FsY3VsYXRlTnVtZXJpY0J1bGxldHMocm9vdCk7XG4gIH1cbn1cbiIsImltcG9ydCB7IFBsdWdpbl8yIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IFByZWMgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IGtleW1hcCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL015RWRpdG9yXCI7XG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4uL2ZlYXR1cmVzL0ZlYXR1cmVcIjtcbmltcG9ydCB7IE1vdmVEb3duT3BlcmF0aW9uIH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvTW92ZURvd25PcGVyYXRpb25cIjtcbmltcG9ydCB7IE1vdmVMZWZ0T3BlcmF0aW9uIH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvTW92ZUxlZnRPcGVyYXRpb25cIjtcbmltcG9ydCB7IE1vdmVSaWdodE9wZXJhdGlvbiB9IGZyb20gXCIuLi9vcGVyYXRpb25zL01vdmVSaWdodE9wZXJhdGlvblwiO1xuaW1wb3J0IHsgTW92ZVVwT3BlcmF0aW9uIH0gZnJvbSBcIi4uL29wZXJhdGlvbnMvTW92ZVVwT3BlcmF0aW9uXCI7XG5pbXBvcnQgeyBJTUVTZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL0lNRVNlcnZpY2VcIjtcbmltcG9ydCB7IE9ic2lkaWFuU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PYnNpZGlhblNlcnZpY2VcIjtcbmltcG9ydCB7IFBlcmZvcm1PcGVyYXRpb25TZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1BlcmZvcm1PcGVyYXRpb25TZXJ2aWNlXCI7XG5pbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBjbGFzcyBNb3ZlSXRlbXNGZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW5fMixcbiAgICBwcml2YXRlIGltZTogSU1FU2VydmljZSxcbiAgICBwcml2YXRlIG9ic2lkaWFuOiBPYnNpZGlhblNlcnZpY2UsXG4gICAgcHJpdmF0ZSBzZXR0aW5nczogU2V0dGluZ3NTZXJ2aWNlLFxuICAgIHByaXZhdGUgcGVyZm9ybU9wZXJhdGlvbjogUGVyZm9ybU9wZXJhdGlvblNlcnZpY2VcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4uYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJtb3ZlLWxpc3QtaXRlbS11cFwiLFxuICAgICAgbmFtZTogXCJNb3ZlIGxpc3QgYW5kIHN1Ymxpc3RzIHVwXCIsXG4gICAgICBlZGl0b3JDYWxsYmFjazogdGhpcy5vYnNpZGlhbi5jcmVhdGVFZGl0b3JDYWxsYmFjayhcbiAgICAgICAgdGhpcy5tb3ZlTGlzdEVsZW1lbnRVcENvbW1hbmRcbiAgICAgICksXG4gICAgICBob3RrZXlzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBtb2RpZmllcnM6IFtcIk1vZFwiLCBcIlNoaWZ0XCJdLFxuICAgICAgICAgIGtleTogXCJBcnJvd1VwXCIsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgdGhpcy5wbHVnaW4uYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJtb3ZlLWxpc3QtaXRlbS1kb3duXCIsXG4gICAgICBuYW1lOiBcIk1vdmUgbGlzdCBhbmQgc3VibGlzdHMgZG93blwiLFxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IHRoaXMub2JzaWRpYW4uY3JlYXRlRWRpdG9yQ2FsbGJhY2soXG4gICAgICAgIHRoaXMubW92ZUxpc3RFbGVtZW50RG93bkNvbW1hbmRcbiAgICAgICksXG4gICAgICBob3RrZXlzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBtb2RpZmllcnM6IFtcIk1vZFwiLCBcIlNoaWZ0XCJdLFxuICAgICAgICAgIGtleTogXCJBcnJvd0Rvd25cIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnBsdWdpbi5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImluZGVudC1saXN0XCIsXG4gICAgICBuYW1lOiBcIkluZGVudCB0aGUgbGlzdCBhbmQgc3VibGlzdHNcIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiB0aGlzLm9ic2lkaWFuLmNyZWF0ZUVkaXRvckNhbGxiYWNrKFxuICAgICAgICB0aGlzLm1vdmVMaXN0RWxlbWVudFJpZ2h0Q29tbWFuZFxuICAgICAgKSxcbiAgICAgIGhvdGtleXM6IFtdLFxuICAgIH0pO1xuXG4gICAgdGhpcy5wbHVnaW4uYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvdXRkZW50LWxpc3RcIixcbiAgICAgIG5hbWU6IFwiT3V0ZGVudCB0aGUgbGlzdCBhbmQgc3VibGlzdHNcIixcbiAgICAgIGVkaXRvckNhbGxiYWNrOiB0aGlzLm9ic2lkaWFuLmNyZWF0ZUVkaXRvckNhbGxiYWNrKFxuICAgICAgICB0aGlzLm1vdmVMaXN0RWxlbWVudExlZnRDb21tYW5kXG4gICAgICApLFxuICAgICAgaG90a2V5czogW10sXG4gICAgfSk7XG5cbiAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcbiAgICAgIFByZWMuaGlnaGVzdChcbiAgICAgICAga2V5bWFwLm9mKFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBrZXk6IFwiVGFiXCIsXG4gICAgICAgICAgICBydW46IHRoaXMub2JzaWRpYW4uY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2soe1xuICAgICAgICAgICAgICBjaGVjazogdGhpcy5jaGVjayxcbiAgICAgICAgICAgICAgcnVuOiB0aGlzLm1vdmVMaXN0RWxlbWVudFJpZ2h0LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBrZXk6IFwicy1UYWJcIixcbiAgICAgICAgICAgIHJ1bjogdGhpcy5vYnNpZGlhbi5jcmVhdGVLZXltYXBSdW5DYWxsYmFjayh7XG4gICAgICAgICAgICAgIGNoZWNrOiB0aGlzLmNoZWNrLFxuICAgICAgICAgICAgICBydW46IHRoaXMubW92ZUxpc3RFbGVtZW50TGVmdCxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG5cbiAgcHJpdmF0ZSBjaGVjayA9ICgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5iZXR0ZXJUYWIgJiYgIXRoaXMuaW1lLmlzSU1FT3BlbmVkKCk7XG4gIH07XG5cbiAgcHJpdmF0ZSBtb3ZlTGlzdEVsZW1lbnREb3duQ29tbWFuZCA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgY29uc3QgeyBzaG91bGRTdG9wUHJvcGFnYXRpb24gfSA9IHRoaXMucGVyZm9ybU9wZXJhdGlvbi5wZXJmb3JtT3BlcmF0aW9uKFxuICAgICAgKHJvb3QpID0+IG5ldyBNb3ZlRG93bk9wZXJhdGlvbihyb290KSxcbiAgICAgIGVkaXRvclxuICAgICk7XG5cbiAgICByZXR1cm4gc2hvdWxkU3RvcFByb3BhZ2F0aW9uO1xuICB9O1xuXG4gIHByaXZhdGUgbW92ZUxpc3RFbGVtZW50VXBDb21tYW5kID0gKGVkaXRvcjogTXlFZGl0b3IpID0+IHtcbiAgICBjb25zdCB7IHNob3VsZFN0b3BQcm9wYWdhdGlvbiB9ID0gdGhpcy5wZXJmb3JtT3BlcmF0aW9uLnBlcmZvcm1PcGVyYXRpb24oXG4gICAgICAocm9vdCkgPT4gbmV3IE1vdmVVcE9wZXJhdGlvbihyb290KSxcbiAgICAgIGVkaXRvclxuICAgICk7XG5cbiAgICByZXR1cm4gc2hvdWxkU3RvcFByb3BhZ2F0aW9uO1xuICB9O1xuXG4gIHByaXZhdGUgbW92ZUxpc3RFbGVtZW50UmlnaHRDb21tYW5kID0gKGVkaXRvcjogTXlFZGl0b3IpID0+IHtcbiAgICBpZiAodGhpcy5pbWUuaXNJTUVPcGVuZWQoKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMubW92ZUxpc3RFbGVtZW50UmlnaHQoZWRpdG9yKS5zaG91bGRTdG9wUHJvcGFnYXRpb247XG4gIH07XG5cbiAgcHJpdmF0ZSBtb3ZlTGlzdEVsZW1lbnRSaWdodCA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMucGVyZm9ybU9wZXJhdGlvbi5wZXJmb3JtT3BlcmF0aW9uKFxuICAgICAgKHJvb3QpID0+XG4gICAgICAgIG5ldyBNb3ZlUmlnaHRPcGVyYXRpb24ocm9vdCwgdGhpcy5vYnNpZGlhbi5nZXREZWZhdWx0SW5kZW50Q2hhcnMoKSksXG4gICAgICBlZGl0b3JcbiAgICApO1xuICB9O1xuXG4gIHByaXZhdGUgbW92ZUxpc3RFbGVtZW50TGVmdENvbW1hbmQgPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIGlmICh0aGlzLmltZS5pc0lNRU9wZW5lZCgpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5tb3ZlTGlzdEVsZW1lbnRMZWZ0KGVkaXRvcikuc2hvdWxkU3RvcFByb3BhZ2F0aW9uO1xuICB9O1xuXG4gIHByaXZhdGUgbW92ZUxpc3RFbGVtZW50TGVmdCA9IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMucGVyZm9ybU9wZXJhdGlvbi5wZXJmb3JtT3BlcmF0aW9uKFxuICAgICAgKHJvb3QpID0+IG5ldyBNb3ZlTGVmdE9wZXJhdGlvbihyb290KSxcbiAgICAgIGVkaXRvclxuICAgICk7XG4gIH07XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCwgbWF4UG9zLCBtaW5Qb3MgfSBmcm9tIFwiLi4vcm9vdFwiO1xuXG5leHBvcnQgY2xhc3MgU2VsZWN0QWxsT3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZVNlbGVjdGlvbigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gcm9vdC5nZXRTZWxlY3Rpb25zKClbMF07XG4gICAgY29uc3QgW3Jvb3RTdGFydCwgcm9vdEVuZF0gPSByb290LmdldFJhbmdlKCk7XG5cbiAgICBjb25zdCBzZWxlY3Rpb25Gcm9tID0gbWluUG9zKHNlbGVjdGlvbi5hbmNob3IsIHNlbGVjdGlvbi5oZWFkKTtcbiAgICBjb25zdCBzZWxlY3Rpb25UbyA9IG1heFBvcyhzZWxlY3Rpb24uYW5jaG9yLCBzZWxlY3Rpb24uaGVhZCk7XG5cbiAgICBpZiAoXG4gICAgICBzZWxlY3Rpb25Gcm9tLmxpbmUgPCByb290U3RhcnQubGluZSB8fFxuICAgICAgc2VsZWN0aW9uVG8ubGluZSA+IHJvb3RFbmQubGluZVxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHNlbGVjdGlvbkZyb20ubGluZSA9PT0gcm9vdFN0YXJ0LmxpbmUgJiZcbiAgICAgIHNlbGVjdGlvbkZyb20uY2ggPT09IHJvb3RTdGFydC5jaCAmJlxuICAgICAgc2VsZWN0aW9uVG8ubGluZSA9PT0gcm9vdEVuZC5saW5lICYmXG4gICAgICBzZWxlY3Rpb25Uby5jaCA9PT0gcm9vdEVuZC5jaFxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IGxpc3QgPSByb290LmdldExpc3RVbmRlckN1cnNvcigpO1xuICAgIGNvbnN0IGNvbnRlbnRTdGFydCA9IGxpc3QuZ2V0Rmlyc3RMaW5lQ29udGVudFN0YXJ0KCk7XG4gICAgY29uc3QgY29udGVudEVuZCA9IGxpc3QuZ2V0TGFzdExpbmVDb250ZW50RW5kKCk7XG5cbiAgICBpZiAoXG4gICAgICBzZWxlY3Rpb25Gcm9tLmxpbmUgPCBjb250ZW50U3RhcnQubGluZSB8fFxuICAgICAgc2VsZWN0aW9uVG8ubGluZSA+IGNvbnRlbnRFbmQubGluZVxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gdHJ1ZTtcbiAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuXG4gICAgaWYgKFxuICAgICAgc2VsZWN0aW9uRnJvbS5saW5lID09PSBjb250ZW50U3RhcnQubGluZSAmJlxuICAgICAgc2VsZWN0aW9uRnJvbS5jaCA9PT0gY29udGVudFN0YXJ0LmNoICYmXG4gICAgICBzZWxlY3Rpb25Uby5saW5lID09PSBjb250ZW50RW5kLmxpbmUgJiZcbiAgICAgIHNlbGVjdGlvblRvLmNoID09PSBjb250ZW50RW5kLmNoXG4gICAgKSB7XG4gICAgICAvLyBzZWxlY3QgYWxsIGxpc3RcbiAgICAgIHJvb3QucmVwbGFjZVNlbGVjdGlvbnMoW3sgYW5jaG9yOiByb290U3RhcnQsIGhlYWQ6IHJvb3RFbmQgfV0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBzZWxlY3QgYWxsIGxpbmVcbiAgICAgIHJvb3QucmVwbGFjZVNlbGVjdGlvbnMoW3sgYW5jaG9yOiBjb250ZW50U3RhcnQsIGhlYWQ6IGNvbnRlbnRFbmQgfV0pO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG59XG4iLCJpbXBvcnQgeyBQbHVnaW5fMiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBrZXltYXAgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyBNeUVkaXRvciB9IGZyb20gXCIuLi9NeUVkaXRvclwiO1xuaW1wb3J0IHsgRmVhdHVyZSB9IGZyb20gXCIuLi9mZWF0dXJlcy9GZWF0dXJlXCI7XG5pbXBvcnQgeyBTZWxlY3RBbGxPcGVyYXRpb24gfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9TZWxlY3RBbGxPcGVyYXRpb25cIjtcbmltcG9ydCB7IElNRVNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvSU1FU2VydmljZVwiO1xuaW1wb3J0IHsgT2JzaWRpYW5TZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09ic2lkaWFuU2VydmljZVwiO1xuaW1wb3J0IHsgUGVyZm9ybU9wZXJhdGlvblNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvUGVyZm9ybU9wZXJhdGlvblNlcnZpY2VcIjtcbmltcG9ydCB7IFNldHRpbmdzU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1NlcnZpY2VcIjtcblxuZXhwb3J0IGNsYXNzIFNlbGVjdEFsbEZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbl8yLFxuICAgIHByaXZhdGUgc2V0dGluZ3M6IFNldHRpbmdzU2VydmljZSxcbiAgICBwcml2YXRlIGltZTogSU1FU2VydmljZSxcbiAgICBwcml2YXRlIG9ic2lkaWFuOiBPYnNpZGlhblNlcnZpY2UsXG4gICAgcHJpdmF0ZSBwZXJmb3JtT3BlcmF0aW9uOiBQZXJmb3JtT3BlcmF0aW9uU2VydmljZVxuICApIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcbiAgICAgIGtleW1hcC5vZihbXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6IFwiYy1hXCIsXG4gICAgICAgICAgbWFjOiBcIm0tYVwiLFxuICAgICAgICAgIHJ1bjogdGhpcy5vYnNpZGlhbi5jcmVhdGVLZXltYXBSdW5DYWxsYmFjayh7XG4gICAgICAgICAgICBjaGVjazogdGhpcy5jaGVjayxcbiAgICAgICAgICAgIHJ1bjogdGhpcy5ydW4sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICBdKVxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2hlY2sgPSAoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuc2V0dGluZ3Muc2VsZWN0QWxsICYmICF0aGlzLmltZS5pc0lNRU9wZW5lZCgpO1xuICB9O1xuXG4gIHByaXZhdGUgcnVuID0gKGVkaXRvcjogTXlFZGl0b3IpID0+IHtcbiAgICByZXR1cm4gdGhpcy5wZXJmb3JtT3BlcmF0aW9uLnBlcmZvcm1PcGVyYXRpb24oXG4gICAgICAocm9vdCkgPT4gbmV3IFNlbGVjdEFsbE9wZXJhdGlvbihyb290KSxcbiAgICAgIGVkaXRvclxuICAgICk7XG4gIH07XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBTZWxlY3RUaWxsTGluZVN0YXJ0T3BlcmF0aW9uIGltcGxlbWVudHMgT3BlcmF0aW9uIHtcbiAgcHJpdmF0ZSBzdG9wUHJvcGFnYXRpb24gPSBmYWxzZTtcbiAgcHJpdmF0ZSB1cGRhdGVkID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSByb290OiBSb290KSB7fVxuXG4gIHNob3VsZFN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdG9wUHJvcGFnYXRpb247XG4gIH1cblxuICBzaG91bGRVcGRhdGUoKSB7XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlZDtcbiAgfVxuXG4gIHBlcmZvcm0oKSB7XG4gICAgY29uc3QgeyByb290IH0gPSB0aGlzO1xuXG4gICAgaWYgKCFyb290Lmhhc1NpbmdsZUN1cnNvcigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zdG9wUHJvcGFnYXRpb24gPSB0cnVlO1xuICAgIHRoaXMudXBkYXRlZCA9IHRydWU7XG5cbiAgICBjb25zdCBjdXJzb3IgPSByb290LmdldEN1cnNvcigpO1xuICAgIGNvbnN0IGxpc3QgPSByb290LmdldExpc3RVbmRlckN1cnNvcigpO1xuICAgIGNvbnN0IGxpbmVzID0gbGlzdC5nZXRMaW5lc0luZm8oKTtcbiAgICBjb25zdCBsaW5lTm8gPSBsaW5lcy5maW5kSW5kZXgoKGwpID0+IGwuZnJvbS5saW5lID09PSBjdXJzb3IubGluZSk7XG5cbiAgICByb290LnJlcGxhY2VTZWxlY3Rpb25zKFt7IGhlYWQ6IGxpbmVzW2xpbmVOb10uZnJvbSwgYW5jaG9yOiBjdXJzb3IgfV0pO1xuICB9XG59XG4iLCJpbXBvcnQgeyBQbHVnaW5fMiB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBrZXltYXAgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vRmVhdHVyZVwiO1xuXG5pbXBvcnQgeyBNeUVkaXRvciB9IGZyb20gXCIuLi9NeUVkaXRvclwiO1xuaW1wb3J0IHsgU2VsZWN0VGlsbExpbmVTdGFydE9wZXJhdGlvbiB9IGZyb20gXCIuLi9vcGVyYXRpb25zL1NlbGVjdFRpbGxMaW5lU3RhcnRPcGVyYXRpb25cIjtcbmltcG9ydCB7IElNRVNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvSU1FU2VydmljZVwiO1xuaW1wb3J0IHsgT2JzaWRpYW5TZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL09ic2lkaWFuU2VydmljZVwiO1xuaW1wb3J0IHsgUGVyZm9ybU9wZXJhdGlvblNlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvUGVyZm9ybU9wZXJhdGlvblNlcnZpY2VcIjtcbmltcG9ydCB7IFNldHRpbmdzU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9TZXR0aW5nc1NlcnZpY2VcIjtcblxuZXhwb3J0IGNsYXNzIFNlbGVjdGlvblNob3VsZElnbm9yZUJ1bGxldHNGZWF0dXJlIGltcGxlbWVudHMgRmVhdHVyZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgcGx1Z2luOiBQbHVnaW5fMixcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UsXG4gICAgcHJpdmF0ZSBpbWU6IElNRVNlcnZpY2UsXG4gICAgcHJpdmF0ZSBvYnNpZGlhbjogT2JzaWRpYW5TZXJ2aWNlLFxuICAgIHByaXZhdGUgcGVyZm9ybU9wZXJhdGlvbjogUGVyZm9ybU9wZXJhdGlvblNlcnZpY2VcbiAgKSB7fVxuXG4gIGFzeW5jIGxvYWQoKSB7XG4gICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICBrZXltYXAub2YoW1xuICAgICAgICB7XG4gICAgICAgICAga2V5OiBcIm0tcy1BcnJvd0xlZnRcIixcbiAgICAgICAgICBydW46IHRoaXMub2JzaWRpYW4uY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2soe1xuICAgICAgICAgICAgY2hlY2s6IHRoaXMuY2hlY2ssXG4gICAgICAgICAgICBydW46IHRoaXMucnVuLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgXSlcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdW5sb2FkKCkge31cblxuICBwcml2YXRlIGNoZWNrID0gKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLnNldHRpbmdzLnN0aWNrQ3Vyc29yICYmICF0aGlzLmltZS5pc0lNRU9wZW5lZCgpO1xuICB9O1xuXG4gIHByaXZhdGUgcnVuID0gKGVkaXRvcjogTXlFZGl0b3IpID0+IHtcbiAgICByZXR1cm4gdGhpcy5wZXJmb3JtT3BlcmF0aW9uLnBlcmZvcm1PcGVyYXRpb24oXG4gICAgICAocm9vdCkgPT4gbmV3IFNlbGVjdFRpbGxMaW5lU3RhcnRPcGVyYXRpb24ocm9vdCksXG4gICAgICBlZGl0b3JcbiAgICApO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgQXBwLCBQbHVnaW5TZXR0aW5nVGFiLCBQbHVnaW5fMiwgU2V0dGluZyB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBGZWF0dXJlIH0gZnJvbSBcIi4vRmVhdHVyZVwiO1xuXG5pbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmNsYXNzIE9ic2lkaWFuT3V0bGluZXJQbHVnaW5TZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IFBsdWdpbl8yLCBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UpIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gIH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG5cbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkltcHJvdmUgdGhlIHN0eWxlIG9mIHlvdXIgbGlzdHNcIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIlN0eWxlcyBhcmUgb25seSBjb21wYXRpYmxlIHdpdGggYnVpbHQtaW4gT2JzaWRpYW4gdGhlbWVzIGFuZCBtYXkgbm90IGJlIGNvbXBhdGlibGUgd2l0aCBvdGhlciB0aGVtZXMuIFN0eWxlcyBvbmx5IHdvcmsgd2VsbCB3aXRoIHRhYiBzaXplIDQuXCJcbiAgICAgIClcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5zZXR0aW5ncy5zdHlsZUxpc3RzKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnNldHRpbmdzLnN0eWxlTGlzdHMgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnNldHRpbmdzLnNhdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJTdGljayB0aGUgY3Vyc29yIHRvIHRoZSBjb250ZW50XCIpXG4gICAgICAuc2V0RGVzYyhcIkRvbid0IGxldCB0aGUgY3Vyc29yIG1vdmUgdG8gdGhlIGJ1bGxldCBwb3NpdGlvbi5cIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5zZXR0aW5ncy5zdGlja0N1cnNvcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXR0aW5ncy5zdGlja0N1cnNvciA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2V0dGluZ3Muc2F2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkVuaGFuY2UgdGhlIEVudGVyIGtleVwiKVxuICAgICAgLnNldERlc2MoXCJNYWtlIHRoZSBFbnRlciBrZXkgYmVoYXZlIHRoZSBzYW1lIGFzIG90aGVyIG91dGxpbmVycy5cIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5zZXR0aW5ncy5iZXR0ZXJFbnRlcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXR0aW5ncy5iZXR0ZXJFbnRlciA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2V0dGluZ3Muc2F2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkVuaGFuY2UgdGhlIFRhYiBrZXlcIilcbiAgICAgIC5zZXREZXNjKFwiTWFrZSBUYWIgYW5kIFNoaWZ0LVRhYiBiZWhhdmUgdGhlIHNhbWUgYXMgb3RoZXIgb3V0bGluZXJzLlwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB7XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnNldHRpbmdzLmJldHRlclRhYikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXR0aW5ncy5iZXR0ZXJUYWIgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnNldHRpbmdzLnNhdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJFbmhhbmNlIHRoZSBDdHJsK0Egb3IgQ21kK0EgYmVoYXZpb3JcIilcbiAgICAgIC5zZXREZXNjKFxuICAgICAgICBcIlByZXNzIHRoZSBob3RrZXkgb25jZSB0byBzZWxlY3QgdGhlIGN1cnJlbnQgbGlzdCBpdGVtLiBQcmVzcyB0aGUgaG90a2V5IHR3aWNlIHRvIHNlbGVjdCB0aGUgZW50aXJlIGxpc3QuXCJcbiAgICAgIClcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5zZXR0aW5ncy5zZWxlY3RBbGwpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMuc2V0dGluZ3Muc2VsZWN0QWxsID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5zZXR0aW5ncy5zYXZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiRGVidWcgbW9kZVwiKVxuICAgICAgLnNldERlc2MoXG4gICAgICAgIFwiT3BlbiBEZXZUb29scyAoQ29tbWFuZCtPcHRpb24rSSBvciBDb250cm9sK1NoaWZ0K0kpIHRvIGNvcHkgdGhlIGRlYnVnIGxvZ3MuXCJcbiAgICAgIClcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4ge1xuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5zZXR0aW5ncy5kZWJ1Zykub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5zZXR0aW5ncy5kZWJ1ZyA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMuc2V0dGluZ3Muc2F2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1RhYkZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBwbHVnaW46IFBsdWdpbl8yLCBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UpIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbi5hZGRTZXR0aW5nVGFiKFxuICAgICAgbmV3IE9ic2lkaWFuT3V0bGluZXJQbHVnaW5TZXR0aW5nVGFiKFxuICAgICAgICB0aGlzLnBsdWdpbi5hcHAsXG4gICAgICAgIHRoaXMucGx1Z2luLFxuICAgICAgICB0aGlzLnNldHRpbmdzXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHt9XG59XG4iLCJpbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi9PcGVyYXRpb25cIjtcblxuaW1wb3J0IHsgUm9vdCB9IGZyb20gXCIuLi9yb290XCI7XG5cbmV4cG9ydCBjbGFzcyBDcmVhdGVOb3RlTGluZU9wZXJhdGlvbiBpbXBsZW1lbnRzIE9wZXJhdGlvbiB7XG4gIHByaXZhdGUgc3RvcFByb3BhZ2F0aW9uID0gZmFsc2U7XG4gIHByaXZhdGUgdXBkYXRlZCA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcm9vdDogUm9vdCwgcHJpdmF0ZSBkZWZhdWx0SW5kZW50Q2hhcnM6IHN0cmluZykge31cblxuICBzaG91bGRTdG9wUHJvcGFnYXRpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RvcFByb3BhZ2F0aW9uO1xuICB9XG5cbiAgc2hvdWxkVXBkYXRlKCkge1xuICAgIHJldHVybiB0aGlzLnVwZGF0ZWQ7XG4gIH1cblxuICBwZXJmb3JtKCkge1xuICAgIGNvbnN0IHsgcm9vdCB9ID0gdGhpcztcblxuICAgIGlmICghcm9vdC5oYXNTaW5nbGVDdXJzb3IoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGN1cnNvciA9IHJvb3QuZ2V0Q3Vyc29yKCk7XG4gICAgY29uc3QgbGlzdCA9IHJvb3QuZ2V0TGlzdFVuZGVyQ3Vyc29yKCk7XG4gICAgY29uc3QgbGluZVVuZGVyQ3Vyc29yID0gbGlzdFxuICAgICAgLmdldExpbmVzSW5mbygpXG4gICAgICAuZmluZCgobCkgPT4gbC5mcm9tLmxpbmUgPT09IGN1cnNvci5saW5lKTtcblxuICAgIGlmIChjdXJzb3IuY2ggPCBsaW5lVW5kZXJDdXJzb3IuZnJvbS5jaCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uID0gdHJ1ZTtcbiAgICB0aGlzLnVwZGF0ZWQgPSB0cnVlO1xuXG4gICAgaWYgKCFsaXN0LmdldE5vdGVzSW5kZW50KCkpIHtcbiAgICAgIGNvbnN0IGluZGVudCA9IGxpc3QuaXNFbXB0eSgpXG4gICAgICAgID8gbGlzdC5nZXRGaXJzdExpbmVJbmRlbnQoKSArIHRoaXMuZGVmYXVsdEluZGVudENoYXJzXG4gICAgICAgIDogbGlzdC5nZXRDaGlsZHJlbigpWzBdLmdldEZpcnN0TGluZUluZGVudCgpO1xuXG4gICAgICBsaXN0LnNldE5vdGVzSW5kZW50KGluZGVudCk7XG4gICAgfVxuXG4gICAgY29uc3QgbGluZXMgPSBsaXN0LmdldExpbmVzSW5mbygpLnJlZHVjZSgoYWNjLCBsaW5lKSA9PiB7XG4gICAgICBpZiAoY3Vyc29yLmxpbmUgPT09IGxpbmUuZnJvbS5saW5lKSB7XG4gICAgICAgIGFjYy5wdXNoKGxpbmUudGV4dC5zbGljZSgwLCBjdXJzb3IuY2ggLSBsaW5lLmZyb20uY2gpKTtcbiAgICAgICAgYWNjLnB1c2gobGluZS50ZXh0LnNsaWNlKGN1cnNvci5jaCAtIGxpbmUuZnJvbS5jaCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWNjLnB1c2gobGluZS50ZXh0KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSBhcyBzdHJpbmdbXSk7XG5cbiAgICBsaXN0LnJlcGxhY2VMaW5lcyhsaW5lcyk7XG5cbiAgICByb290LnJlcGxhY2VDdXJzb3Ioe1xuICAgICAgbGluZTogY3Vyc29yLmxpbmUgKyAxLFxuICAgICAgY2g6IGxpc3QuZ2V0Tm90ZXNJbmRlbnQoKS5sZW5ndGgsXG4gICAgfSk7XG4gIH1cbn1cbiIsImltcG9ydCB7IFBsdWdpbl8yIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IGtleW1hcCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5cbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9GZWF0dXJlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL015RWRpdG9yXCI7XG5pbXBvcnQgeyBDcmVhdGVOb3RlTGluZU9wZXJhdGlvbiB9IGZyb20gXCIuLi9vcGVyYXRpb25zL0NyZWF0ZU5vdGVMaW5lT3BlcmF0aW9uXCI7XG5pbXBvcnQgeyBJTUVTZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL0lNRVNlcnZpY2VcIjtcbmltcG9ydCB7IE9ic2lkaWFuU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9PYnNpZGlhblNlcnZpY2VcIjtcbmltcG9ydCB7IFBlcmZvcm1PcGVyYXRpb25TZXJ2aWNlIH0gZnJvbSBcIi4uL3NlcnZpY2VzL1BlcmZvcm1PcGVyYXRpb25TZXJ2aWNlXCI7XG5pbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBjbGFzcyBTaGlmdEVudGVyU2hvdWxkQ3JlYXRlTm90ZUZlYXR1cmUgaW1wbGVtZW50cyBGZWF0dXJlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSBwbHVnaW46IFBsdWdpbl8yLFxuICAgIHByaXZhdGUgb2JzaWRpYW46IE9ic2lkaWFuU2VydmljZSxcbiAgICBwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UsXG4gICAgcHJpdmF0ZSBpbWU6IElNRVNlcnZpY2UsXG4gICAgcHJpdmF0ZSBwZXJmb3JtT3BlcmF0aW9uOiBQZXJmb3JtT3BlcmF0aW9uU2VydmljZVxuICApIHt9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihcbiAgICAgIGtleW1hcC5vZihbXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6IFwicy1FbnRlclwiLFxuICAgICAgICAgIHJ1bjogdGhpcy5vYnNpZGlhbi5jcmVhdGVLZXltYXBSdW5DYWxsYmFjayh7XG4gICAgICAgICAgICBjaGVjazogdGhpcy5jaGVjayxcbiAgICAgICAgICAgIHJ1bjogdGhpcy5ydW4sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICBdKVxuICAgICk7XG4gIH1cblxuICBhc3luYyB1bmxvYWQoKSB7fVxuXG4gIHByaXZhdGUgY2hlY2sgPSAoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuc2V0dGluZ3MuYmV0dGVyRW50ZXIgJiYgIXRoaXMuaW1lLmlzSU1FT3BlbmVkKCk7XG4gIH07XG5cbiAgcHJpdmF0ZSBydW4gPSAoZWRpdG9yOiBNeUVkaXRvcikgPT4ge1xuICAgIHJldHVybiB0aGlzLnBlcmZvcm1PcGVyYXRpb24ucGVyZm9ybU9wZXJhdGlvbihcbiAgICAgIChyb290KSA9PlxuICAgICAgICBuZXcgQ3JlYXRlTm90ZUxpbmVPcGVyYXRpb24oXG4gICAgICAgICAgcm9vdCxcbiAgICAgICAgICB0aGlzLm9ic2lkaWFuLmdldERlZmF1bHRJbmRlbnRDaGFycygpXG4gICAgICAgICksXG4gICAgICBlZGl0b3JcbiAgICApO1xuICB9O1xufVxuIiwiZXhwb3J0IGludGVyZmFjZSBBcHBseUNoYW5nZXNFZGl0b3JQb3NpdGlvbiB7XG4gIGxpbmU6IG51bWJlcjtcbiAgY2g6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBseUNoYW5nZXNFZGl0b3JTZWxlY3Rpb24ge1xuICBhbmNob3I6IEFwcGx5Q2hhbmdlc0VkaXRvclBvc2l0aW9uO1xuICBoZWFkOiBBcHBseUNoYW5nZXNFZGl0b3JQb3NpdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBseUNoYW5nZXNFZGl0b3Ige1xuICBnZXRSYW5nZShcbiAgICBmcm9tOiBBcHBseUNoYW5nZXNFZGl0b3JQb3NpdGlvbixcbiAgICB0bzogQXBwbHlDaGFuZ2VzRWRpdG9yUG9zaXRpb25cbiAgKTogc3RyaW5nO1xuICByZXBsYWNlUmFuZ2UoXG4gICAgcmVwbGFjZW1lbnQ6IHN0cmluZyxcbiAgICBmcm9tOiBBcHBseUNoYW5nZXNFZGl0b3JQb3NpdGlvbixcbiAgICB0bzogQXBwbHlDaGFuZ2VzRWRpdG9yUG9zaXRpb25cbiAgKTogdm9pZDtcbiAgc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zOiBBcHBseUNoYW5nZXNFZGl0b3JTZWxlY3Rpb25bXSk6IHZvaWQ7XG4gIGZvbGQobjogbnVtYmVyKTogdm9pZDtcbiAgdW5mb2xkKG46IG51bWJlcik6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwbHlDaGFuZ2VzTGlzdCB7XG4gIGlzRm9sZFJvb3QoKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBseUNoYW5nZXNSb290IHtcbiAgZ2V0UmFuZ2UoKTogW0FwcGx5Q2hhbmdlc0VkaXRvclBvc2l0aW9uLCBBcHBseUNoYW5nZXNFZGl0b3JQb3NpdGlvbl07XG4gIGdldFNlbGVjdGlvbnMoKToge1xuICAgIGFuY2hvcjogQXBwbHlDaGFuZ2VzRWRpdG9yUG9zaXRpb247XG4gICAgaGVhZDogQXBwbHlDaGFuZ2VzRWRpdG9yUG9zaXRpb247XG4gIH1bXTtcbiAgcHJpbnQoKTogc3RyaW5nO1xuICBnZXRMaXN0VW5kZXJMaW5lKGw6IG51bWJlcik6IEFwcGx5Q2hhbmdlc0xpc3Q7XG59XG5cbmV4cG9ydCBjbGFzcyBBcHBseUNoYW5nZXNTZXJ2aWNlIHtcbiAgYXBwbHlDaGFuZ2VzKGVkaXRvcjogQXBwbHlDaGFuZ2VzRWRpdG9yLCByb290OiBBcHBseUNoYW5nZXNSb290KSB7XG4gICAgY29uc3Qgcm9vdFJhbmdlID0gcm9vdC5nZXRSYW5nZSgpO1xuICAgIGNvbnN0IG9sZFN0cmluZyA9IGVkaXRvci5nZXRSYW5nZShyb290UmFuZ2VbMF0sIHJvb3RSYW5nZVsxXSk7XG4gICAgY29uc3QgbmV3U3RyaW5nID0gcm9vdC5wcmludCgpO1xuXG4gICAgY29uc3QgZnJvbUxpbmUgPSByb290UmFuZ2VbMF0ubGluZTtcbiAgICBjb25zdCB0b0xpbmUgPSByb290UmFuZ2VbMV0ubGluZTtcblxuICAgIGZvciAobGV0IGwgPSBmcm9tTGluZTsgbCA8PSB0b0xpbmU7IGwrKykge1xuICAgICAgZWRpdG9yLnVuZm9sZChsKTtcbiAgICB9XG5cbiAgICBjb25zdCBjaGFuZ2VGcm9tID0geyAuLi5yb290UmFuZ2VbMF0gfTtcbiAgICBjb25zdCBjaGFuZ2VUbyA9IHsgLi4ucm9vdFJhbmdlWzFdIH07XG4gICAgbGV0IG9sZFRtcCA9IG9sZFN0cmluZztcbiAgICBsZXQgbmV3VG1wID0gbmV3U3RyaW5nO1xuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnN0YW50LWNvbmRpdGlvblxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCBubEluZGV4ID0gb2xkVG1wLmluZGV4T2YoXCJcXG5cIik7XG4gICAgICBpZiAobmxJbmRleCA8IDApIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjb25zdCBvbGRMaW5lID0gb2xkVG1wLnNsaWNlKDAsIG5sSW5kZXggKyAxKTtcbiAgICAgIGNvbnN0IG5ld0xpbmUgPSBuZXdUbXAuc2xpY2UoMCwgb2xkTGluZS5sZW5ndGgpO1xuICAgICAgaWYgKG9sZExpbmUgIT09IG5ld0xpbmUpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjaGFuZ2VGcm9tLmxpbmUrKztcbiAgICAgIG9sZFRtcCA9IG9sZFRtcC5zbGljZShvbGRMaW5lLmxlbmd0aCk7XG4gICAgICBuZXdUbXAgPSBuZXdUbXAuc2xpY2Uob2xkTGluZS5sZW5ndGgpO1xuICAgIH1cbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc3RhbnQtY29uZGl0aW9uXG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGNvbnN0IG5sSW5kZXggPSBvbGRUbXAubGFzdEluZGV4T2YoXCJcXG5cIik7XG4gICAgICBpZiAobmxJbmRleCA8IDApIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjb25zdCBvbGRMaW5lID0gb2xkVG1wLnNsaWNlKG5sSW5kZXgpO1xuICAgICAgY29uc3QgbmV3TGluZSA9IG5ld1RtcC5zbGljZSgtb2xkTGluZS5sZW5ndGgpO1xuICAgICAgaWYgKG9sZExpbmUgIT09IG5ld0xpbmUpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBvbGRUbXAgPSBvbGRUbXAuc2xpY2UoMCwgLW9sZExpbmUubGVuZ3RoKTtcbiAgICAgIG5ld1RtcCA9IG5ld1RtcC5zbGljZSgwLCAtb2xkTGluZS5sZW5ndGgpO1xuXG4gICAgICBjb25zdCBubEluZGV4MiA9IG9sZFRtcC5sYXN0SW5kZXhPZihcIlxcblwiKTtcbiAgICAgIGNoYW5nZVRvLmNoID1cbiAgICAgICAgbmxJbmRleDIgPj0gMCA/IG9sZFRtcC5sZW5ndGggLSBubEluZGV4MiAtIDEgOiBvbGRUbXAubGVuZ3RoO1xuICAgICAgY2hhbmdlVG8ubGluZS0tO1xuICAgIH1cblxuICAgIGlmIChvbGRUbXAgIT09IG5ld1RtcCkge1xuICAgICAgZWRpdG9yLnJlcGxhY2VSYW5nZShuZXdUbXAsIGNoYW5nZUZyb20sIGNoYW5nZVRvKTtcbiAgICB9XG5cbiAgICBlZGl0b3Iuc2V0U2VsZWN0aW9ucyhyb290LmdldFNlbGVjdGlvbnMoKSk7XG5cbiAgICAvLyBUT0RPOiBsaW5lcyBjb3VsZCBiZSBkaWZmZXJlbnQgYmVjYXVzZSBvZiBkZWxldGV0aW9uXG4gICAgZm9yIChsZXQgbCA9IGZyb21MaW5lOyBsIDw9IHRvTGluZTsgbCsrKSB7XG4gICAgICBjb25zdCBsaW5lID0gcm9vdC5nZXRMaXN0VW5kZXJMaW5lKGwpO1xuICAgICAgaWYgKGxpbmUgJiYgbGluZS5pc0ZvbGRSb290KCkpIHtcbiAgICAgICAgZWRpdG9yLmZvbGQobCk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iLCJleHBvcnQgY2xhc3MgSU1FU2VydmljZSB7XG4gIHByaXZhdGUgY29tcG9zaXRpb24gPSBmYWxzZTtcblxuICBhc3luYyBsb2FkKCkge1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjb21wb3NpdGlvbnN0YXJ0XCIsIHRoaXMub25Db21wb3NpdGlvblN0YXJ0KTtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiY29tcG9zaXRpb25lbmRcIiwgdGhpcy5vbkNvbXBvc2l0aW9uRW5kKTtcbiAgfVxuXG4gIGFzeW5jIHVubG9hZCgpIHtcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwiY29tcG9zaXRpb25lbmRcIiwgdGhpcy5vbkNvbXBvc2l0aW9uRW5kKTtcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwiY29tcG9zaXRpb25zdGFydFwiLCB0aGlzLm9uQ29tcG9zaXRpb25TdGFydCk7XG4gIH1cblxuICBpc0lNRU9wZW5lZCgpIHtcbiAgICByZXR1cm4gdGhpcy5jb21wb3NpdGlvbjtcbiAgfVxuXG4gIHByaXZhdGUgb25Db21wb3NpdGlvblN0YXJ0ID0gKCkgPT4ge1xuICAgIHRoaXMuY29tcG9zaXRpb24gPSB0cnVlO1xuICB9O1xuXG4gIHByaXZhdGUgb25Db21wb3NpdGlvbkVuZCA9ICgpID0+IHtcbiAgICB0aGlzLmNvbXBvc2l0aW9uID0gZmFsc2U7XG4gIH07XG59XG4iLCJpbXBvcnQgeyBTZXR0aW5nc1NlcnZpY2UgfSBmcm9tIFwiLi9TZXR0aW5nc1NlcnZpY2VcIjtcblxuZXhwb3J0IGNsYXNzIExvZ2dlclNlcnZpY2Uge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHNldHRpbmdzOiBTZXR0aW5nc1NlcnZpY2UpIHt9XG5cbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgbG9nKG1ldGhvZDogc3RyaW5nLCAuLi5hcmdzOiBhbnlbXSkge1xuICAgIGlmICghdGhpcy5zZXR0aW5ncy5kZWJ1Zykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnNvbGUuaW5mbyhtZXRob2QsIC4uLmFyZ3MpO1xuICB9XG5cbiAgYmluZChtZXRob2Q6IHN0cmluZykge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgcmV0dXJuICguLi5hcmdzOiBhbnlbXSkgPT4gdGhpcy5sb2cobWV0aG9kLCAuLi5hcmdzKTtcbiAgfVxufVxuIiwiLyogZXNsaW50LWRpc2FibGUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXVudXNlZC12YXJzICovXG5pbXBvcnQgeyBFZGl0b3IgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgZm9sZEVmZmVjdCwgZm9sZGVkUmFuZ2VzLCB1bmZvbGRFZmZlY3QgfSBmcm9tIFwiQGNvZGVtaXJyb3IvZm9sZFwiO1xuaW1wb3J0IHsgZm9sZGFibGUgfSBmcm9tIFwiQGNvZGVtaXJyb3IvbGFuZ3VhZ2VcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcsIHJ1blNjb3BlSGFuZGxlcnMgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuXG5leHBvcnQgY2xhc3MgTXlFZGl0b3JQb3NpdGlvbiB7XG4gIGxpbmU6IG51bWJlcjtcbiAgY2g6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIE15RWRpdG9yU2VsZWN0aW9uIHtcbiAgYW5jaG9yOiBNeUVkaXRvclBvc2l0aW9uO1xuICBoZWFkOiBNeUVkaXRvclBvc2l0aW9uO1xufVxuXG5mdW5jdGlvbiBmb2xkSW5zaWRlKHZpZXc6IEVkaXRvclZpZXcsIGZyb206IG51bWJlciwgdG86IG51bWJlcikge1xuICBsZXQgZm91bmQ6IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcbiAgZm9sZGVkUmFuZ2VzKHZpZXcuc3RhdGUpLmJldHdlZW4oZnJvbSwgdG8sIChmcm9tLCB0bykgPT4ge1xuICAgIGlmICghZm91bmQgfHwgZm91bmQuZnJvbSA+IGZyb20pIGZvdW5kID0geyBmcm9tLCB0byB9O1xuICB9KTtcbiAgcmV0dXJuIGZvdW5kO1xufVxuXG5leHBvcnQgY2xhc3MgTXlFZGl0b3Ige1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGU6IEVkaXRvcikge31cblxuICBnZXRDdXJzb3IoKTogTXlFZGl0b3JQb3NpdGlvbiB7XG4gICAgcmV0dXJuIHRoaXMuZS5nZXRDdXJzb3IoKTtcbiAgfVxuXG4gIGdldExpbmUobjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5lLmdldExpbmUobik7XG4gIH1cblxuICBsYXN0TGluZSgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmUubGFzdExpbmUoKTtcbiAgfVxuXG4gIGxpc3RTZWxlY3Rpb25zKCk6IE15RWRpdG9yU2VsZWN0aW9uW10ge1xuICAgIHJldHVybiB0aGlzLmUubGlzdFNlbGVjdGlvbnMoKTtcbiAgfVxuXG4gIGdldFJhbmdlKGZyb206IE15RWRpdG9yUG9zaXRpb24sIHRvOiBNeUVkaXRvclBvc2l0aW9uKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5lLmdldFJhbmdlKGZyb20sIHRvKTtcbiAgfVxuXG4gIHJlcGxhY2VSYW5nZShcbiAgICByZXBsYWNlbWVudDogc3RyaW5nLFxuICAgIGZyb206IE15RWRpdG9yUG9zaXRpb24sXG4gICAgdG86IE15RWRpdG9yUG9zaXRpb25cbiAgKTogdm9pZCB7XG4gICAgcmV0dXJuIHRoaXMuZS5yZXBsYWNlUmFuZ2UocmVwbGFjZW1lbnQsIGZyb20sIHRvKTtcbiAgfVxuXG4gIHNldFNlbGVjdGlvbnMoc2VsZWN0aW9uczogTXlFZGl0b3JTZWxlY3Rpb25bXSk6IHZvaWQge1xuICAgIHRoaXMuZS5zZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnMpO1xuICB9XG5cbiAgc2V0VmFsdWUodGV4dDogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5lLnNldFZhbHVlKHRleHQpO1xuICB9XG5cbiAgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5lLmdldFZhbHVlKCk7XG4gIH1cblxuICBmb2xkKG46IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHZpZXcgPSB0aGlzLmdldEVkaXRvclZpZXcoKTtcbiAgICBjb25zdCBsID0gdmlldy5saW5lQmxvY2tBdCh2aWV3LnN0YXRlLmRvYy5saW5lKG4gKyAxKS5mcm9tKTtcbiAgICBjb25zdCByYW5nZSA9IGZvbGRhYmxlKHZpZXcuc3RhdGUsIGwuZnJvbSwgbC50byk7XG5cbiAgICBpZiAoIXJhbmdlIHx8IHJhbmdlLmZyb20gPT09IHJhbmdlLnRvKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmlldy5kaXNwYXRjaCh7IGVmZmVjdHM6IFtmb2xkRWZmZWN0Lm9mKHJhbmdlKV0gfSk7XG4gIH1cblxuICB1bmZvbGQobjogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0RWRpdG9yVmlldygpO1xuICAgIGNvbnN0IGwgPSB2aWV3LmxpbmVCbG9ja0F0KHZpZXcuc3RhdGUuZG9jLmxpbmUobiArIDEpLmZyb20pO1xuICAgIGNvbnN0IHJhbmdlID0gZm9sZEluc2lkZSh2aWV3LCBsLmZyb20sIGwudG8pO1xuXG4gICAgaWYgKCFyYW5nZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZpZXcuZGlzcGF0Y2goeyBlZmZlY3RzOiBbdW5mb2xkRWZmZWN0Lm9mKHJhbmdlKV0gfSk7XG4gIH1cblxuICBpc0ZvbGRlZChuOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5nZXRGaXJzdExpbmVPZkZvbGRpbmcobikgIT09IG51bGw7XG4gIH1cblxuICBnZXRGaXJzdExpbmVPZkZvbGRpbmcobjogbnVtYmVyKTogbnVtYmVyIHwgbnVsbCB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0RWRpdG9yVmlldygpO1xuICAgIGNvbnN0IGwgPSB2aWV3LmxpbmVCbG9ja0F0KHZpZXcuc3RhdGUuZG9jLmxpbmUobiArIDEpLmZyb20pO1xuICAgIGNvbnN0IHJhbmdlID0gZm9sZEluc2lkZSh2aWV3LCBsLmZyb20sIGwudG8pO1xuXG4gICAgaWYgKCFyYW5nZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZpZXcuc3RhdGUuZG9jLmxpbmVBdChyYW5nZS5mcm9tKS5udW1iZXIgLSAxO1xuICB9XG5cbiAgdHJpZ2dlck9uS2V5RG93bihlOiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgcnVuU2NvcGVIYW5kbGVycyh0aGlzLmdldEVkaXRvclZpZXcoKSwgZSwgXCJlZGl0b3JcIik7XG4gIH1cblxuICBwcml2YXRlIGdldEVkaXRvclZpZXcoKTogRWRpdG9yVmlldyB7XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICByZXR1cm4gKHRoaXMuZSBhcyBhbnkpLmNtO1xuICB9XG59XG4iLCJpbXBvcnQgeyBBcHAsIEVkaXRvciwgZWRpdG9yVmlld0ZpZWxkIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IEVkaXRvclN0YXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuaW1wb3J0IHsgTXlFZGl0b3IgfSBmcm9tIFwiLi4vTXlFZGl0b3JcIjtcblxuZXhwb3J0IGludGVyZmFjZSBPYnNpZGlhblRhYnNTZXR0aW5ncyB7XG4gIHVzZVRhYjogYm9vbGVhbjtcbiAgdGFiU2l6ZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE9ic2lkaWFuRm9sZFNldHRpbmdzIHtcbiAgZm9sZEluZGVudDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIE9ic2lkaWFuU2VydmljZSB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgYXBwOiBBcHApIHt9XG5cbiAgaXNMZWdhY3lFZGl0b3JFbmFibGVkKCkge1xuICAgIGNvbnN0IGNvbmZpZzogeyBsZWdhY3lFZGl0b3I6IGJvb2xlYW4gfSA9IHtcbiAgICAgIGxlZ2FjeUVkaXRvcjogdHJ1ZSxcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAuLi4odGhpcy5hcHAudmF1bHQgYXMgYW55KS5jb25maWcsXG4gICAgfTtcblxuICAgIHJldHVybiBjb25maWcubGVnYWN5RWRpdG9yO1xuICB9XG5cbiAgaXNEZWZhdWx0VGhlbWVFbmFibGVkKCkge1xuICAgIGNvbnN0IGNvbmZpZzogeyBjc3NUaGVtZTogc3RyaW5nIH0gPSB7XG4gICAgICBjc3NUaGVtZTogXCJcIixcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAuLi4odGhpcy5hcHAudmF1bHQgYXMgYW55KS5jb25maWcsXG4gICAgfTtcblxuICAgIHJldHVybiBjb25maWcuY3NzVGhlbWUgPT09IFwiXCI7XG4gIH1cblxuICBnZXRPYnNpZGlhblRhYnNTZXR0aW5ncygpOiBPYnNpZGlhblRhYnNTZXR0aW5ncyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHVzZVRhYjogdHJ1ZSxcbiAgICAgIHRhYlNpemU6IDQsXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgLi4uKHRoaXMuYXBwLnZhdWx0IGFzIGFueSkuY29uZmlnLFxuICAgIH07XG4gIH1cblxuICBnZXRPYnNpZGlhbkZvbGRTZXR0aW5ncygpOiBPYnNpZGlhbkZvbGRTZXR0aW5ncyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGZvbGRJbmRlbnQ6IGZhbHNlLFxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIC4uLih0aGlzLmFwcC52YXVsdCBhcyBhbnkpLmNvbmZpZyxcbiAgICB9O1xuICB9XG5cbiAgZ2V0RGVmYXVsdEluZGVudENoYXJzKCkge1xuICAgIGNvbnN0IHsgdXNlVGFiLCB0YWJTaXplIH0gPSB0aGlzLmdldE9ic2lkaWFuVGFic1NldHRpbmdzKCk7XG5cbiAgICByZXR1cm4gdXNlVGFiID8gXCJcXHRcIiA6IG5ldyBBcnJheSh0YWJTaXplKS5maWxsKFwiIFwiKS5qb2luKFwiXCIpO1xuICB9XG5cbiAgZ2V0RWRpdG9yRnJvbVN0YXRlKHN0YXRlOiBFZGl0b3JTdGF0ZSkge1xuICAgIHJldHVybiBuZXcgTXlFZGl0b3Ioc3RhdGUuZmllbGQoZWRpdG9yVmlld0ZpZWxkKS5lZGl0b3IpO1xuICB9XG5cbiAgY3JlYXRlS2V5bWFwUnVuQ2FsbGJhY2soY29uZmlnOiB7XG4gICAgY2hlY2s/OiAoZWRpdG9yOiBNeUVkaXRvcikgPT4gYm9vbGVhbjtcbiAgICBydW46IChlZGl0b3I6IE15RWRpdG9yKSA9PiB7XG4gICAgICBzaG91bGRVcGRhdGU6IGJvb2xlYW47XG4gICAgICBzaG91bGRTdG9wUHJvcGFnYXRpb246IGJvb2xlYW47XG4gICAgfTtcbiAgfSkge1xuICAgIGNvbnN0IGNoZWNrID0gY29uZmlnLmNoZWNrIHx8ICgoKSA9PiB0cnVlKTtcbiAgICBjb25zdCB7IHJ1biB9ID0gY29uZmlnO1xuXG4gICAgcmV0dXJuICh2aWV3OiBFZGl0b3JWaWV3KTogYm9vbGVhbiA9PiB7XG4gICAgICBjb25zdCBlZGl0b3IgPSB0aGlzLmdldEVkaXRvckZyb21TdGF0ZSh2aWV3LnN0YXRlKTtcblxuICAgICAgaWYgKCFjaGVjayhlZGl0b3IpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgeyBzaG91bGRVcGRhdGUsIHNob3VsZFN0b3BQcm9wYWdhdGlvbiB9ID0gcnVuKGVkaXRvcik7XG5cbiAgICAgIHJldHVybiBzaG91bGRVcGRhdGUgfHwgc2hvdWxkU3RvcFByb3BhZ2F0aW9uO1xuICAgIH07XG4gIH1cblxuICBjcmVhdGVFZGl0b3JDYWxsYmFjayhjYjogKGVkaXRvcjogTXlFZGl0b3IpID0+IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gKGVkaXRvcjogRWRpdG9yKSA9PiB7XG4gICAgICBjb25zdCBteUVkaXRvciA9IG5ldyBNeUVkaXRvcihlZGl0b3IpO1xuICAgICAgY29uc3Qgc2hvdWxkU3RvcFByb3BhZ2F0aW9uID0gY2IobXlFZGl0b3IpO1xuXG4gICAgICBpZiAoXG4gICAgICAgICFzaG91bGRTdG9wUHJvcGFnYXRpb24gJiZcbiAgICAgICAgd2luZG93LmV2ZW50ICYmXG4gICAgICAgIHdpbmRvdy5ldmVudC50eXBlID09PSBcImtleWRvd25cIlxuICAgICAgKSB7XG4gICAgICAgIG15RWRpdG9yLnRyaWdnZXJPbktleURvd24od2luZG93LmV2ZW50IGFzIEtleWJvYXJkRXZlbnQpO1xuICAgICAgfVxuICAgIH07XG4gIH1cbn1cbiIsImltcG9ydCB7IExpc3QsIFJvb3QgfSBmcm9tIFwiLi4vcm9vdFwiO1xuaW1wb3J0IHsgTG9nZ2VyU2VydmljZSB9IGZyb20gXCIuLi9zZXJ2aWNlcy9Mb2dnZXJTZXJ2aWNlXCI7XG5cbmNvbnN0IGJ1bGxldFNpZ24gPSBgKD86Wy0qK118XFxcXGQrXFxcXC4pYDtcblxuY29uc3QgbGlzdEl0ZW1XaXRob3V0U3BhY2VzUmUgPSBuZXcgUmVnRXhwKGBeJHtidWxsZXRTaWdufSggfFxcdClgKTtcbmNvbnN0IGxpc3RJdGVtUmUgPSBuZXcgUmVnRXhwKGBeWyBcXHRdKiR7YnVsbGV0U2lnbn0oIHxcXHQpYCk7XG5jb25zdCBzdHJpbmdXaXRoU3BhY2VzUmUgPSBuZXcgUmVnRXhwKGBeWyBcXHRdK2ApO1xuY29uc3QgcGFyc2VMaXN0SXRlbVJlID0gbmV3IFJlZ0V4cChgXihbIFxcdF0qKSgke2J1bGxldFNpZ259KSggfFxcdCkoLiopJGApO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWRlclBvc2l0aW9uIHtcbiAgbGluZTogbnVtYmVyO1xuICBjaDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWRlclNlbGVjdGlvbiB7XG4gIGFuY2hvcjogUmVhZGVyUG9zaXRpb247XG4gIGhlYWQ6IFJlYWRlclBvc2l0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWRlciB7XG4gIGdldEN1cnNvcigpOiBSZWFkZXJQb3NpdGlvbjtcbiAgZ2V0TGluZShuOiBudW1iZXIpOiBzdHJpbmc7XG4gIGxhc3RMaW5lKCk6IG51bWJlcjtcbiAgbGlzdFNlbGVjdGlvbnMoKTogUmVhZGVyU2VsZWN0aW9uW107XG4gIGdldEZpcnN0TGluZU9mRm9sZGluZyhsaW5lOiBudW1iZXIpOiBudW1iZXIgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgUGFyc2VMaXN0TGlzdCB7XG4gIGdldEZpcnN0TGluZUluZGVudCgpOiBzdHJpbmc7XG4gIHNldE5vdGVzSW5kZW50KG5vdGVzSW5kZW50OiBzdHJpbmcpOiB2b2lkO1xuICBnZXROb3Rlc0luZGVudCgpOiBzdHJpbmcgfCBudWxsO1xuICBhZGRMaW5lKHRleHQ6IHN0cmluZyk6IHZvaWQ7XG4gIGdldFBhcmVudCgpOiBQYXJzZUxpc3RMaXN0IHwgbnVsbDtcbiAgYWRkQWZ0ZXJBbGwobGlzdDogUGFyc2VMaXN0TGlzdCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBQYXJzZXJTZXJ2aWNlIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBsb2dnZXI6IExvZ2dlclNlcnZpY2UpIHt9XG5cbiAgcGFyc2UoZWRpdG9yOiBSZWFkZXIsIGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3IoKSk6IFJvb3QgfCBudWxsIHtcbiAgICBjb25zdCBkID0gdGhpcy5sb2dnZXIuYmluZChcInBhcnNlTGlzdFwiKTtcbiAgICBjb25zdCBlcnJvciA9IChtc2c6IHN0cmluZyk6IG51bGwgPT4ge1xuICAgICAgZChtc2cpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfTtcblxuICAgIGNvbnN0IGxpbmUgPSBlZGl0b3IuZ2V0TGluZShjdXJzb3IubGluZSk7XG5cbiAgICBsZXQgbGlzdExvb2tpbmdQb3M6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gICAgaWYgKHRoaXMuaXNMaXN0SXRlbShsaW5lKSkge1xuICAgICAgbGlzdExvb2tpbmdQb3MgPSBjdXJzb3IubGluZTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuaXNMaW5lV2l0aEluZGVudChsaW5lKSkge1xuICAgICAgbGV0IGxpc3RMb29raW5nUG9zU2VhcmNoID0gY3Vyc29yLmxpbmUgLSAxO1xuICAgICAgd2hpbGUgKGxpc3RMb29raW5nUG9zU2VhcmNoID49IDApIHtcbiAgICAgICAgY29uc3QgbGluZSA9IGVkaXRvci5nZXRMaW5lKGxpc3RMb29raW5nUG9zU2VhcmNoKTtcbiAgICAgICAgaWYgKHRoaXMuaXNMaXN0SXRlbShsaW5lKSkge1xuICAgICAgICAgIGxpc3RMb29raW5nUG9zID0gbGlzdExvb2tpbmdQb3NTZWFyY2g7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc0xpbmVXaXRoSW5kZW50KGxpbmUpKSB7XG4gICAgICAgICAgbGlzdExvb2tpbmdQb3NTZWFyY2gtLTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChsaXN0TG9va2luZ1BvcyA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBsZXQgbGlzdFN0YXJ0TGluZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IGxpc3RTdGFydExpbmVMb29rdXAgPSBsaXN0TG9va2luZ1BvcztcbiAgICB3aGlsZSAobGlzdFN0YXJ0TGluZUxvb2t1cCA+PSAwKSB7XG4gICAgICBjb25zdCBsaW5lID0gZWRpdG9yLmdldExpbmUobGlzdFN0YXJ0TGluZUxvb2t1cCk7XG4gICAgICBpZiAoIXRoaXMuaXNMaXN0SXRlbShsaW5lKSAmJiAhdGhpcy5pc0xpbmVXaXRoSW5kZW50KGxpbmUpKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMuaXNMaXN0SXRlbVdpdGhvdXRTcGFjZXMobGluZSkpIHtcbiAgICAgICAgbGlzdFN0YXJ0TGluZSA9IGxpc3RTdGFydExpbmVMb29rdXA7XG4gICAgICB9XG4gICAgICBsaXN0U3RhcnRMaW5lTG9va3VwLS07XG4gICAgfVxuXG4gICAgaWYgKGxpc3RTdGFydExpbmUgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxldCBsaXN0RW5kTGluZSA9IGxpc3RMb29raW5nUG9zO1xuICAgIGxldCBsaXN0RW5kTGluZUxvb2t1cCA9IGxpc3RMb29raW5nUG9zO1xuICAgIHdoaWxlIChsaXN0RW5kTGluZUxvb2t1cCA8PSBlZGl0b3IubGFzdExpbmUoKSkge1xuICAgICAgY29uc3QgbGluZSA9IGVkaXRvci5nZXRMaW5lKGxpc3RFbmRMaW5lTG9va3VwKTtcbiAgICAgIGlmICghdGhpcy5pc0xpc3RJdGVtKGxpbmUpICYmICF0aGlzLmlzTGluZVdpdGhJbmRlbnQobGluZSkpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoIXRoaXMuaXNFbXB0eUxpbmUobGluZSkpIHtcbiAgICAgICAgbGlzdEVuZExpbmUgPSBsaXN0RW5kTGluZUxvb2t1cDtcbiAgICAgIH1cbiAgICAgIGxpc3RFbmRMaW5lTG9va3VwKys7XG4gICAgfVxuXG4gICAgaWYgKGxpc3RTdGFydExpbmUgPiBjdXJzb3IubGluZSB8fCBsaXN0RW5kTGluZSA8IGN1cnNvci5saW5lKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCByb290ID0gbmV3IFJvb3QoXG4gICAgICB7IGxpbmU6IGxpc3RTdGFydExpbmUsIGNoOiAwIH0sXG4gICAgICB7IGxpbmU6IGxpc3RFbmRMaW5lLCBjaDogZWRpdG9yLmdldExpbmUobGlzdEVuZExpbmUpLmxlbmd0aCB9LFxuICAgICAgZWRpdG9yLmxpc3RTZWxlY3Rpb25zKCkubWFwKChyKSA9PiAoe1xuICAgICAgICBhbmNob3I6IHsgbGluZTogci5hbmNob3IubGluZSwgY2g6IHIuYW5jaG9yLmNoIH0sXG4gICAgICAgIGhlYWQ6IHsgbGluZTogci5oZWFkLmxpbmUsIGNoOiByLmhlYWQuY2ggfSxcbiAgICAgIH0pKVxuICAgICk7XG5cbiAgICBsZXQgY3VycmVudFBhcmVudDogUGFyc2VMaXN0TGlzdCA9IHJvb3QuZ2V0Um9vdExpc3QoKTtcbiAgICBsZXQgY3VycmVudExpc3Q6IFBhcnNlTGlzdExpc3QgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgY3VycmVudEluZGVudCA9IFwiXCI7XG5cbiAgICBmb3IgKGxldCBsID0gbGlzdFN0YXJ0TGluZTsgbCA8PSBsaXN0RW5kTGluZTsgbCsrKSB7XG4gICAgICBjb25zdCBsaW5lID0gZWRpdG9yLmdldExpbmUobCk7XG4gICAgICBjb25zdCBtYXRjaGVzID0gcGFyc2VMaXN0SXRlbVJlLmV4ZWMobGluZSk7XG5cbiAgICAgIGlmIChtYXRjaGVzKSB7XG4gICAgICAgIGNvbnN0IFssIGluZGVudCwgYnVsbGV0LCBzcGFjZUFmdGVyQnVsbGV0LCBjb250ZW50XSA9IG1hdGNoZXM7XG5cbiAgICAgICAgY29uc3QgY29tcGFyZUxlbmd0aCA9IE1hdGgubWluKGN1cnJlbnRJbmRlbnQubGVuZ3RoLCBpbmRlbnQubGVuZ3RoKTtcbiAgICAgICAgY29uc3QgaW5kZW50U2xpY2UgPSBpbmRlbnQuc2xpY2UoMCwgY29tcGFyZUxlbmd0aCk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRJbmRlbnRTbGljZSA9IGN1cnJlbnRJbmRlbnQuc2xpY2UoMCwgY29tcGFyZUxlbmd0aCk7XG5cbiAgICAgICAgaWYgKGluZGVudFNsaWNlICE9PSBjdXJyZW50SW5kZW50U2xpY2UpIHtcbiAgICAgICAgICBjb25zdCBleHBlY3RlZCA9IGN1cnJlbnRJbmRlbnRTbGljZVxuICAgICAgICAgICAgLnJlcGxhY2UoLyAvZywgXCJTXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx0L2csIFwiVFwiKTtcbiAgICAgICAgICBjb25zdCBnb3QgPSBpbmRlbnRTbGljZS5yZXBsYWNlKC8gL2csIFwiU1wiKS5yZXBsYWNlKC9cXHQvZywgXCJUXCIpO1xuXG4gICAgICAgICAgcmV0dXJuIGVycm9yKFxuICAgICAgICAgICAgYFVuYWJsZSB0byBwYXJzZSBsaXN0OiBleHBlY3RlZCBpbmRlbnQgXCIke2V4cGVjdGVkfVwiLCBnb3QgXCIke2dvdH1cImBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGluZGVudC5sZW5ndGggPiBjdXJyZW50SW5kZW50Lmxlbmd0aCkge1xuICAgICAgICAgIGN1cnJlbnRQYXJlbnQgPSBjdXJyZW50TGlzdDtcbiAgICAgICAgICBjdXJyZW50SW5kZW50ID0gaW5kZW50O1xuICAgICAgICB9IGVsc2UgaWYgKGluZGVudC5sZW5ndGggPCBjdXJyZW50SW5kZW50Lmxlbmd0aCkge1xuICAgICAgICAgIHdoaWxlIChcbiAgICAgICAgICAgIGN1cnJlbnRQYXJlbnQuZ2V0Rmlyc3RMaW5lSW5kZW50KCkubGVuZ3RoID49IGluZGVudC5sZW5ndGggJiZcbiAgICAgICAgICAgIGN1cnJlbnRQYXJlbnQuZ2V0UGFyZW50KClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIGN1cnJlbnRQYXJlbnQgPSBjdXJyZW50UGFyZW50LmdldFBhcmVudCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjdXJyZW50SW5kZW50ID0gaW5kZW50O1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZm9sZGVkID1cbiAgICAgICAgICBlZGl0b3IuZ2V0Rmlyc3RMaW5lT2ZGb2xkaW5nKE1hdGgubWluKGwsIGxpc3RFbmRMaW5lKSkgPT09IGw7XG5cbiAgICAgICAgY3VycmVudExpc3QgPSBuZXcgTGlzdChcbiAgICAgICAgICByb290LFxuICAgICAgICAgIGluZGVudCxcbiAgICAgICAgICBidWxsZXQsXG4gICAgICAgICAgc3BhY2VBZnRlckJ1bGxldCxcbiAgICAgICAgICBjb250ZW50LFxuICAgICAgICAgIGZvbGRlZFxuICAgICAgICApO1xuICAgICAgICBjdXJyZW50UGFyZW50LmFkZEFmdGVyQWxsKGN1cnJlbnRMaXN0KTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5pc0xpbmVXaXRoSW5kZW50KGxpbmUpKSB7XG4gICAgICAgIGlmICghY3VycmVudExpc3QpIHtcbiAgICAgICAgICByZXR1cm4gZXJyb3IoXG4gICAgICAgICAgICBgVW5hYmxlIHRvIHBhcnNlIGxpc3Q6IGV4cGVjdGVkIGxpc3QgaXRlbSwgZ290IGVtcHR5IGxpbmVgXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGluZGVudFRvQ2hlY2sgPSBjdXJyZW50TGlzdC5nZXROb3Rlc0luZGVudCgpIHx8IGN1cnJlbnRJbmRlbnQ7XG5cbiAgICAgICAgaWYgKGxpbmUuaW5kZXhPZihpbmRlbnRUb0NoZWNrKSAhPT0gMCkge1xuICAgICAgICAgIGNvbnN0IGV4cGVjdGVkID0gaW5kZW50VG9DaGVjay5yZXBsYWNlKC8gL2csIFwiU1wiKS5yZXBsYWNlKC9cXHQvZywgXCJUXCIpO1xuICAgICAgICAgIGNvbnN0IGdvdCA9IGxpbmVcbiAgICAgICAgICAgIC5tYXRjaCgvXlsgXFx0XSovKVswXVxuICAgICAgICAgICAgLnJlcGxhY2UoLyAvZywgXCJTXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx0L2csIFwiVFwiKTtcblxuICAgICAgICAgIHJldHVybiBlcnJvcihcbiAgICAgICAgICAgIGBVbmFibGUgdG8gcGFyc2UgbGlzdDogZXhwZWN0ZWQgaW5kZW50IFwiJHtleHBlY3RlZH1cIiwgZ290IFwiJHtnb3R9XCJgXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY3VycmVudExpc3QuZ2V0Tm90ZXNJbmRlbnQoKSkge1xuICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBsaW5lLm1hdGNoKC9eWyBcXHRdKy8pO1xuXG4gICAgICAgICAgaWYgKCFtYXRjaGVzIHx8IG1hdGNoZXNbMF0ubGVuZ3RoIDw9IGN1cnJlbnRJbmRlbnQubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAoL15cXHMrJC8udGVzdChsaW5lKSkge1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGVycm9yKFxuICAgICAgICAgICAgICBgVW5hYmxlIHRvIHBhcnNlIGxpc3Q6IGV4cGVjdGVkIHNvbWUgaW5kZW50LCBnb3Qgbm8gaW5kZW50YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjdXJyZW50TGlzdC5zZXROb3Rlc0luZGVudChtYXRjaGVzWzBdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGN1cnJlbnRMaXN0LmFkZExpbmUobGluZS5zbGljZShjdXJyZW50TGlzdC5nZXROb3Rlc0luZGVudCgpLmxlbmd0aCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGVycm9yKFxuICAgICAgICAgIGBVbmFibGUgdG8gcGFyc2UgbGlzdDogZXhwZWN0ZWQgbGlzdCBpdGVtIG9yIG5vdGUsIGdvdCBcIiR7bGluZX1cImBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcm9vdDtcbiAgfVxuXG4gIHByaXZhdGUgaXNFbXB0eUxpbmUobGluZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGxpbmUubGVuZ3RoID09PSAwO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0xpbmVXaXRoSW5kZW50KGxpbmU6IHN0cmluZykge1xuICAgIHJldHVybiBzdHJpbmdXaXRoU3BhY2VzUmUudGVzdChsaW5lKTtcbiAgfVxuXG4gIHByaXZhdGUgaXNMaXN0SXRlbShsaW5lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbGlzdEl0ZW1SZS50ZXN0KGxpbmUpO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0xpc3RJdGVtV2l0aG91dFNwYWNlcyhsaW5lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbGlzdEl0ZW1XaXRob3V0U3BhY2VzUmUudGVzdChsaW5lKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgQXBwbHlDaGFuZ2VzU2VydmljZSB9IGZyb20gXCIuL0FwcGx5Q2hhbmdlc1NlcnZpY2VcIjtcbmltcG9ydCB7IFBhcnNlclNlcnZpY2UgfSBmcm9tIFwiLi9QYXJzZXJTZXJ2aWNlXCI7XG5cbmltcG9ydCB7IE15RWRpdG9yIH0gZnJvbSBcIi4uL015RWRpdG9yXCI7XG5pbXBvcnQgeyBPcGVyYXRpb24gfSBmcm9tIFwiLi4vb3BlcmF0aW9ucy9PcGVyYXRpb25cIjtcbmltcG9ydCB7IFJvb3QgfSBmcm9tIFwiLi4vcm9vdFwiO1xuXG5leHBvcnQgY2xhc3MgUGVyZm9ybU9wZXJhdGlvblNlcnZpY2Uge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHBhcnNlcjogUGFyc2VyU2VydmljZSxcbiAgICBwcml2YXRlIGFwcGx5Q2hhbmdlczogQXBwbHlDaGFuZ2VzU2VydmljZVxuICApIHt9XG5cbiAgZXZhbE9wZXJhdGlvbihyb290OiBSb290LCBvcDogT3BlcmF0aW9uLCBlZGl0b3I6IE15RWRpdG9yKSB7XG4gICAgb3AucGVyZm9ybSgpO1xuXG4gICAgaWYgKG9wLnNob3VsZFVwZGF0ZSgpKSB7XG4gICAgICB0aGlzLmFwcGx5Q2hhbmdlcy5hcHBseUNoYW5nZXMoZWRpdG9yLCByb290KTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2hvdWxkVXBkYXRlOiBvcC5zaG91bGRVcGRhdGUoKSxcbiAgICAgIHNob3VsZFN0b3BQcm9wYWdhdGlvbjogb3Auc2hvdWxkU3RvcFByb3BhZ2F0aW9uKCksXG4gICAgfTtcbiAgfVxuXG4gIHBlcmZvcm1PcGVyYXRpb24oXG4gICAgY2I6IChyb290OiBSb290KSA9PiBPcGVyYXRpb24sXG4gICAgZWRpdG9yOiBNeUVkaXRvcixcbiAgICBjdXJzb3IgPSBlZGl0b3IuZ2V0Q3Vyc29yKClcbiAgKSB7XG4gICAgY29uc3Qgcm9vdCA9IHRoaXMucGFyc2VyLnBhcnNlKGVkaXRvciwgY3Vyc29yKTtcblxuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuIHsgc2hvdWxkVXBkYXRlOiBmYWxzZSwgc2hvdWxkU3RvcFByb3BhZ2F0aW9uOiBmYWxzZSB9O1xuICAgIH1cblxuICAgIGNvbnN0IG9wID0gY2Iocm9vdCk7XG5cbiAgICByZXR1cm4gdGhpcy5ldmFsT3BlcmF0aW9uKHJvb3QsIG9wLCBlZGl0b3IpO1xuICB9XG59XG4iLCJleHBvcnQgaW50ZXJmYWNlIE9ic2lkaWFuT3V0bGluZXJQbHVnaW5TZXR0aW5ncyB7XG4gIHN0eWxlTGlzdHM6IGJvb2xlYW47XG4gIGRlYnVnOiBib29sZWFuO1xuICBzdGlja0N1cnNvcjogYm9vbGVhbjtcbiAgYmV0dGVyRW50ZXI6IGJvb2xlYW47XG4gIGJldHRlclRhYjogYm9vbGVhbjtcbiAgc2VsZWN0QWxsOiBib29sZWFuO1xufVxuXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTOiBPYnNpZGlhbk91dGxpbmVyUGx1Z2luU2V0dGluZ3MgPSB7XG4gIHN0eWxlTGlzdHM6IGZhbHNlLFxuICBkZWJ1ZzogZmFsc2UsXG4gIHN0aWNrQ3Vyc29yOiB0cnVlLFxuICBiZXR0ZXJFbnRlcjogdHJ1ZSxcbiAgYmV0dGVyVGFiOiB0cnVlLFxuICBzZWxlY3RBbGw6IHRydWUsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3JhZ2Uge1xuICBsb2FkRGF0YSgpOiBQcm9taXNlPE9ic2lkaWFuT3V0bGluZXJQbHVnaW5TZXR0aW5ncz47XG4gIHNhdmVEYXRhKHNldHRpZ25zOiBPYnNpZGlhbk91dGxpbmVyUGx1Z2luU2V0dGluZ3MpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG50eXBlIEsgPSBrZXlvZiBPYnNpZGlhbk91dGxpbmVyUGx1Z2luU2V0dGluZ3M7XG50eXBlIFY8VCBleHRlbmRzIEs+ID0gT2JzaWRpYW5PdXRsaW5lclBsdWdpblNldHRpbmdzW1RdO1xudHlwZSBDYWxsYmFjazxUIGV4dGVuZHMgSz4gPSAoY2I6IFY8VD4pID0+IHZvaWQ7XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1NlcnZpY2UgaW1wbGVtZW50cyBPYnNpZGlhbk91dGxpbmVyUGx1Z2luU2V0dGluZ3Mge1xuICBwcml2YXRlIHN0b3JhZ2U6IFN0b3JhZ2U7XG4gIHByaXZhdGUgdmFsdWVzOiBPYnNpZGlhbk91dGxpbmVyUGx1Z2luU2V0dGluZ3M7XG4gIHByaXZhdGUgaGFuZGxlcnM6IE1hcDxLLCBTZXQ8Q2FsbGJhY2s8Sz4+PjtcblxuICBjb25zdHJ1Y3RvcihzdG9yYWdlOiBTdG9yYWdlKSB7XG4gICAgdGhpcy5zdG9yYWdlID0gc3RvcmFnZTtcbiAgICB0aGlzLmhhbmRsZXJzID0gbmV3IE1hcCgpO1xuICB9XG5cbiAgZ2V0IHN0eWxlTGlzdHMoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzLnN0eWxlTGlzdHM7XG4gIH1cbiAgc2V0IHN0eWxlTGlzdHModmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNldChcInN0eWxlTGlzdHNcIiwgdmFsdWUpO1xuICB9XG5cbiAgZ2V0IGRlYnVnKCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlcy5kZWJ1ZztcbiAgfVxuICBzZXQgZGVidWcodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNldChcImRlYnVnXCIsIHZhbHVlKTtcbiAgfVxuXG4gIGdldCBzdGlja0N1cnNvcigpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXMuc3RpY2tDdXJzb3I7XG4gIH1cbiAgc2V0IHN0aWNrQ3Vyc29yKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5zZXQoXCJzdGlja0N1cnNvclwiLCB2YWx1ZSk7XG4gIH1cblxuICBnZXQgYmV0dGVyRW50ZXIoKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzLmJldHRlckVudGVyO1xuICB9XG4gIHNldCBiZXR0ZXJFbnRlcih2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuc2V0KFwiYmV0dGVyRW50ZXJcIiwgdmFsdWUpO1xuICB9XG5cbiAgZ2V0IGJldHRlclRhYigpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXMuYmV0dGVyVGFiO1xuICB9XG4gIHNldCBiZXR0ZXJUYWIodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNldChcImJldHRlclRhYlwiLCB2YWx1ZSk7XG4gIH1cblxuICBnZXQgc2VsZWN0QWxsKCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlcy5zZWxlY3RBbGw7XG4gIH1cbiAgc2V0IHNlbGVjdEFsbCh2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuc2V0KFwic2VsZWN0QWxsXCIsIHZhbHVlKTtcbiAgfVxuXG4gIG9uQ2hhbmdlPFQgZXh0ZW5kcyBLPihrZXk6IFQsIGNiOiBDYWxsYmFjazxUPikge1xuICAgIGlmICghdGhpcy5oYW5kbGVycy5oYXMoa2V5KSkge1xuICAgICAgdGhpcy5oYW5kbGVycy5zZXQoa2V5LCBuZXcgU2V0KCkpO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlcnMuZ2V0KGtleSkuYWRkKGNiKTtcbiAgfVxuXG4gIHJlbW92ZUNhbGxiYWNrPFQgZXh0ZW5kcyBLPihrZXk6IFQsIGNiOiBDYWxsYmFjazxUPik6IHZvaWQge1xuICAgIGNvbnN0IGhhbmRsZXJzID0gdGhpcy5oYW5kbGVycy5nZXQoa2V5KTtcblxuICAgIGlmIChoYW5kbGVycykge1xuICAgICAgaGFuZGxlcnMuZGVsZXRlKGNiKTtcbiAgICB9XG4gIH1cblxuICByZXNldCgpIHtcbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhERUZBVUxUX1NFVFRJTkdTKSkge1xuICAgICAgdGhpcy5zZXQoaywgdik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgbG9hZCgpIHtcbiAgICB0aGlzLnZhbHVlcyA9IE9iamVjdC5hc3NpZ24oXG4gICAgICB7fSxcbiAgICAgIERFRkFVTFRfU0VUVElOR1MsXG4gICAgICBhd2FpdCB0aGlzLnN0b3JhZ2UubG9hZERhdGEoKVxuICAgICk7XG4gIH1cblxuICBhc3luYyBzYXZlKCkge1xuICAgIGF3YWl0IHRoaXMuc3RvcmFnZS5zYXZlRGF0YSh0aGlzLnZhbHVlcyk7XG4gIH1cblxuICBwcml2YXRlIHNldDxUIGV4dGVuZHMgSz4oa2V5OiBULCB2YWx1ZTogVjxLPik6IHZvaWQge1xuICAgIHRoaXMudmFsdWVzW2tleV0gPSB2YWx1ZTtcbiAgICBjb25zdCBjYWxsYmFja3MgPSB0aGlzLmhhbmRsZXJzLmdldChrZXkpO1xuXG4gICAgaWYgKCFjYWxsYmFja3MpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGNiIG9mIGNhbGxiYWNrcy52YWx1ZXMoKSkge1xuICAgICAgY2IodmFsdWUpO1xuICAgIH1cbiAgfVxufVxuIiwiaW1wb3J0IHsgTm90aWNlLCBQbHVnaW4gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgRGVsZXRlU2hvdWxkSWdub3JlQnVsbGV0c0ZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9EZWxldGVTaG91bGRJZ25vcmVCdWxsZXRzRmVhdHVyZVwiO1xuaW1wb3J0IHsgRW5zdXJlQ3Vyc29ySW5MaXN0Q29udGVudEZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9FbnN1cmVDdXJzb3JJbkxpc3RDb250ZW50RmVhdHVyZVwiO1xuaW1wb3J0IHsgRW50ZXJPdXRkZW50SWZMaW5lSXNFbXB0eUZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9FbnRlck91dGRlbnRJZkxpbmVJc0VtcHR5RmVhdHVyZVwiO1xuaW1wb3J0IHsgRW50ZXJTaG91bGRDcmVhdGVOZXdJdGVtRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL0VudGVyU2hvdWxkQ3JlYXRlTmV3SXRlbU9uQ2hpbGRMZXZlbEZlYXR1cmVcIjtcbmltcG9ydCB7IEZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9GZWF0dXJlXCI7XG5pbXBvcnQgeyBGb2xkRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL0ZvbGRGZWF0dXJlXCI7XG5pbXBvcnQgeyBMaXN0c1N0eWxlc0ZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9MaXN0c1N0eWxlc0ZlYXR1cmVcIjtcbmltcG9ydCB7IE1vdmVDdXJzb3JUb1ByZXZpb3VzVW5mb2xkZWRMaW5lRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL01vdmVDdXJzb3JUb1ByZXZpb3VzVW5mb2xkZWRMaW5lRmVhdHVyZVwiO1xuaW1wb3J0IHsgTW92ZUl0ZW1zRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL01vdmVJdGVtc0ZlYXR1cmVcIjtcbmltcG9ydCB7IFNlbGVjdEFsbEZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9TZWxlY3RBbGxGZWF0dXJlXCI7XG5pbXBvcnQgeyBTZWxlY3Rpb25TaG91bGRJZ25vcmVCdWxsZXRzRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL1NlbGVjdGlvblNob3VsZElnbm9yZUJ1bGxldHNGZWF0dXJlXCI7XG5pbXBvcnQgeyBTZXR0aW5nc1RhYkZlYXR1cmUgfSBmcm9tIFwiLi9mZWF0dXJlcy9TZXR0aW5nc1RhYkZlYXR1cmVcIjtcbmltcG9ydCB7IFNoaWZ0RW50ZXJTaG91bGRDcmVhdGVOb3RlRmVhdHVyZSB9IGZyb20gXCIuL2ZlYXR1cmVzL1NoaWZ0RW50ZXJTaG91bGRDcmVhdGVOb3RlRmVhdHVyZVwiO1xuaW1wb3J0IHsgQXBwbHlDaGFuZ2VzU2VydmljZSB9IGZyb20gXCIuL3NlcnZpY2VzL0FwcGx5Q2hhbmdlc1NlcnZpY2VcIjtcbmltcG9ydCB7IElNRVNlcnZpY2UgfSBmcm9tIFwiLi9zZXJ2aWNlcy9JTUVTZXJ2aWNlXCI7XG5pbXBvcnQgeyBMb2dnZXJTZXJ2aWNlIH0gZnJvbSBcIi4vc2VydmljZXMvTG9nZ2VyU2VydmljZVwiO1xuaW1wb3J0IHsgT2JzaWRpYW5TZXJ2aWNlIH0gZnJvbSBcIi4vc2VydmljZXMvT2JzaWRpYW5TZXJ2aWNlXCI7XG5pbXBvcnQgeyBQYXJzZXJTZXJ2aWNlIH0gZnJvbSBcIi4vc2VydmljZXMvUGFyc2VyU2VydmljZVwiO1xuaW1wb3J0IHsgUGVyZm9ybU9wZXJhdGlvblNlcnZpY2UgfSBmcm9tIFwiLi9zZXJ2aWNlcy9QZXJmb3JtT3BlcmF0aW9uU2VydmljZVwiO1xuaW1wb3J0IHsgU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSBcIi4vc2VydmljZXMvU2V0dGluZ3NTZXJ2aWNlXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE9ic2lkaWFuT3V0bGluZXJQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwcml2YXRlIGZlYXR1cmVzOiBGZWF0dXJlW107XG4gIHByb3RlY3RlZCBzZXR0aW5nczogU2V0dGluZ3NTZXJ2aWNlO1xuICBwcml2YXRlIGxvZ2dlcjogTG9nZ2VyU2VydmljZTtcbiAgcHJpdmF0ZSBvYnNpZGlhbjogT2JzaWRpYW5TZXJ2aWNlO1xuICBwcml2YXRlIHBhcnNlcjogUGFyc2VyU2VydmljZTtcbiAgcHJpdmF0ZSBhcHBseUNoYW5nZXM6IEFwcGx5Q2hhbmdlc1NlcnZpY2U7XG4gIHByaXZhdGUgcGVyZm9ybU9wZXJhdGlvbjogUGVyZm9ybU9wZXJhdGlvblNlcnZpY2U7XG4gIHByaXZhdGUgaW1lOiBJTUVTZXJ2aWNlO1xuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBjb25zb2xlLmxvZyhgTG9hZGluZyBvYnNpZGlhbi1vdXRsaW5lcmApO1xuXG4gICAgdGhpcy5vYnNpZGlhbiA9IG5ldyBPYnNpZGlhblNlcnZpY2UodGhpcy5hcHApO1xuXG4gICAgaWYgKHRoaXMub2JzaWRpYW4uaXNMZWdhY3lFZGl0b3JFbmFibGVkKCkpIHtcbiAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgIGBPdXRsaW5lciBwbHVnaW4gZG9lcyBub3Qgc3VwcG9ydCBsZWdhY3kgZWRpdG9yIG1vZGUgc3RhcnRpbmcgZnJvbSB2ZXJzaW9uIDIuMC4gUGxlYXNlIGRpc2FibGUgdGhlIFwiVXNlIGxlZ2FjeSBlZGl0b3JcIiBvcHRpb24gb3IgbWFudWFsbHkgaW5zdGFsbCB2ZXJzaW9uIDEuMCBvZiBPdXRsaW5lciBwbHVnaW4uYCxcbiAgICAgICAgMzAwMDBcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5zZXR0aW5ncyA9IG5ldyBTZXR0aW5nc1NlcnZpY2UodGhpcyk7XG4gICAgYXdhaXQgdGhpcy5zZXR0aW5ncy5sb2FkKCk7XG5cbiAgICB0aGlzLmxvZ2dlciA9IG5ldyBMb2dnZXJTZXJ2aWNlKHRoaXMuc2V0dGluZ3MpO1xuXG4gICAgdGhpcy5wYXJzZXIgPSBuZXcgUGFyc2VyU2VydmljZSh0aGlzLmxvZ2dlcik7XG4gICAgdGhpcy5hcHBseUNoYW5nZXMgPSBuZXcgQXBwbHlDaGFuZ2VzU2VydmljZSgpO1xuICAgIHRoaXMucGVyZm9ybU9wZXJhdGlvbiA9IG5ldyBQZXJmb3JtT3BlcmF0aW9uU2VydmljZShcbiAgICAgIHRoaXMucGFyc2VyLFxuICAgICAgdGhpcy5hcHBseUNoYW5nZXNcbiAgICApO1xuXG4gICAgdGhpcy5pbWUgPSBuZXcgSU1FU2VydmljZSgpO1xuICAgIGF3YWl0IHRoaXMuaW1lLmxvYWQoKTtcblxuICAgIHRoaXMuZmVhdHVyZXMgPSBbXG4gICAgICBuZXcgU2V0dGluZ3NUYWJGZWF0dXJlKHRoaXMsIHRoaXMuc2V0dGluZ3MpLFxuICAgICAgbmV3IExpc3RzU3R5bGVzRmVhdHVyZSh0aGlzLnNldHRpbmdzLCB0aGlzLm9ic2lkaWFuKSxcbiAgICAgIG5ldyBFbnRlck91dGRlbnRJZkxpbmVJc0VtcHR5RmVhdHVyZShcbiAgICAgICAgdGhpcyxcbiAgICAgICAgdGhpcy5zZXR0aW5ncyxcbiAgICAgICAgdGhpcy5pbWUsXG4gICAgICAgIHRoaXMub2JzaWRpYW4sXG4gICAgICAgIHRoaXMucGVyZm9ybU9wZXJhdGlvblxuICAgICAgKSxcbiAgICAgIG5ldyBFbnRlclNob3VsZENyZWF0ZU5ld0l0ZW1GZWF0dXJlKFxuICAgICAgICB0aGlzLFxuICAgICAgICB0aGlzLnNldHRpbmdzLFxuICAgICAgICB0aGlzLmltZSxcbiAgICAgICAgdGhpcy5vYnNpZGlhbixcbiAgICAgICAgdGhpcy5wZXJmb3JtT3BlcmF0aW9uXG4gICAgICApLFxuICAgICAgbmV3IEVuc3VyZUN1cnNvckluTGlzdENvbnRlbnRGZWF0dXJlKFxuICAgICAgICB0aGlzLFxuICAgICAgICB0aGlzLnNldHRpbmdzLFxuICAgICAgICB0aGlzLm9ic2lkaWFuLFxuICAgICAgICB0aGlzLnBlcmZvcm1PcGVyYXRpb25cbiAgICAgICksXG4gICAgICBuZXcgTW92ZUN1cnNvclRvUHJldmlvdXNVbmZvbGRlZExpbmVGZWF0dXJlKFxuICAgICAgICB0aGlzLFxuICAgICAgICB0aGlzLnNldHRpbmdzLFxuICAgICAgICB0aGlzLmltZSxcbiAgICAgICAgdGhpcy5vYnNpZGlhbixcbiAgICAgICAgdGhpcy5wZXJmb3JtT3BlcmF0aW9uXG4gICAgICApLFxuICAgICAgbmV3IERlbGV0ZVNob3VsZElnbm9yZUJ1bGxldHNGZWF0dXJlKFxuICAgICAgICB0aGlzLFxuICAgICAgICB0aGlzLnNldHRpbmdzLFxuICAgICAgICB0aGlzLmltZSxcbiAgICAgICAgdGhpcy5vYnNpZGlhbixcbiAgICAgICAgdGhpcy5wZXJmb3JtT3BlcmF0aW9uXG4gICAgICApLFxuICAgICAgbmV3IFNlbGVjdGlvblNob3VsZElnbm9yZUJ1bGxldHNGZWF0dXJlKFxuICAgICAgICB0aGlzLFxuICAgICAgICB0aGlzLnNldHRpbmdzLFxuICAgICAgICB0aGlzLmltZSxcbiAgICAgICAgdGhpcy5vYnNpZGlhbixcbiAgICAgICAgdGhpcy5wZXJmb3JtT3BlcmF0aW9uXG4gICAgICApLFxuICAgICAgbmV3IEZvbGRGZWF0dXJlKHRoaXMsIHRoaXMub2JzaWRpYW4pLFxuICAgICAgbmV3IFNlbGVjdEFsbEZlYXR1cmUoXG4gICAgICAgIHRoaXMsXG4gICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgIHRoaXMuaW1lLFxuICAgICAgICB0aGlzLm9ic2lkaWFuLFxuICAgICAgICB0aGlzLnBlcmZvcm1PcGVyYXRpb25cbiAgICAgICksXG4gICAgICBuZXcgTW92ZUl0ZW1zRmVhdHVyZShcbiAgICAgICAgdGhpcyxcbiAgICAgICAgdGhpcy5pbWUsXG4gICAgICAgIHRoaXMub2JzaWRpYW4sXG4gICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgIHRoaXMucGVyZm9ybU9wZXJhdGlvblxuICAgICAgKSxcbiAgICAgIG5ldyBTaGlmdEVudGVyU2hvdWxkQ3JlYXRlTm90ZUZlYXR1cmUoXG4gICAgICAgIHRoaXMsXG4gICAgICAgIHRoaXMub2JzaWRpYW4sXG4gICAgICAgIHRoaXMuc2V0dGluZ3MsXG4gICAgICAgIHRoaXMuaW1lLFxuICAgICAgICB0aGlzLnBlcmZvcm1PcGVyYXRpb25cbiAgICAgICksXG4gICAgXTtcblxuICAgIGZvciAoY29uc3QgZmVhdHVyZSBvZiB0aGlzLmZlYXR1cmVzKSB7XG4gICAgICBhd2FpdCBmZWF0dXJlLmxvYWQoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBvbnVubG9hZCgpIHtcbiAgICBjb25zb2xlLmxvZyhgVW5sb2FkaW5nIG9ic2lkaWFuLW91dGxpbmVyYCk7XG5cbiAgICBhd2FpdCB0aGlzLmltZS51bmxvYWQoKTtcblxuICAgIGZvciAoY29uc3QgZmVhdHVyZSBvZiB0aGlzLmZlYXR1cmVzKSB7XG4gICAgICBhd2FpdCBmZWF0dXJlLnVubG9hZCgpO1xuICAgIH1cbiAgfVxufVxuIl0sIm5hbWVzIjpbImtleW1hcCIsIkVkaXRvclN0YXRlIiwiUHJlYyIsIk5vdGljZSIsIlBsdWdpblNldHRpbmdUYWIiLCJTZXR0aW5nIiwiZm9sZGVkUmFuZ2VzIiwiZm9sZGFibGUiLCJmb2xkRWZmZWN0IiwidW5mb2xkRWZmZWN0IiwicnVuU2NvcGVIYW5kbGVycyIsImVkaXRvclZpZXdGaWVsZCIsIlBsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBdURBO0FBQ08sU0FBUyxTQUFTLENBQUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFO0FBQzdELElBQUksU0FBUyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsT0FBTyxLQUFLLFlBQVksQ0FBQyxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyxVQUFVLE9BQU8sRUFBRSxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFO0FBQ2hILElBQUksT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsT0FBTyxDQUFDLEVBQUUsVUFBVSxPQUFPLEVBQUUsTUFBTSxFQUFFO0FBQy9ELFFBQVEsU0FBUyxTQUFTLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtBQUNuRyxRQUFRLFNBQVMsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtBQUN0RyxRQUFRLFNBQVMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRTtBQUN0SCxRQUFRLElBQUksQ0FBQyxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxVQUFVLElBQUksRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUM5RSxLQUFLLENBQUMsQ0FBQztBQUNQOztTQzNFZ0IseUJBQXlCLENBQUMsSUFBVTtJQUNsRCxTQUFTLEtBQUssQ0FBQyxNQUFtQjtRQUNoQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFFZCxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sQ0FBQyxXQUFXLEVBQUUsRUFBRTtZQUN4QyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUU7Z0JBQ25DLEtBQUssQ0FBQyxhQUFhLENBQUMsR0FBRyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7YUFDcEM7WUFFRCxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDZDtLQUNGO0lBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2Q7O01DWGEsdUNBQXVDO0lBSWxELFlBQW9CLElBQVU7UUFBVixTQUFJLEdBQUosSUFBSSxDQUFNO1FBSHRCLG9CQUFlLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLFlBQU8sR0FBRyxLQUFLLENBQUM7S0FFVTtJQUVsQyxxQkFBcUI7UUFDbkIsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDO0tBQzdCO0lBRUQsWUFBWTtRQUNWLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztLQUNyQjtJQUVELE9BQU87UUFDTCxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBRXRCLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUU7WUFDM0IsT0FBTztTQUNSO1FBRUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDdkMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUVsQyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsU0FBUyxDQUM1QixDQUFDLENBQUMsS0FBSyxNQUFNLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQzlELENBQUM7UUFFRixJQUFJLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDaEIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDaEQ7YUFBTSxJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDckIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7U0FDcEQ7S0FDRjtJQUVPLFVBQVUsQ0FDaEIsSUFBVSxFQUNWLE1BQWdCLEVBQ2hCLElBQVUsRUFDVixLQUFpQixFQUNqQixNQUFjO1FBRWQsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDNUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFFcEIsTUFBTSxVQUFVLEdBQUcsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUU5QixJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ2pCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUM7WUFDckIsRUFBRSxFQUFFLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRTtTQUM5RCxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDN0MsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFeEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0tBQzdDO0lBRU8scUJBQXFCLENBQUMsSUFBVSxFQUFFLE1BQWdCLEVBQUUsSUFBVTtRQUNwRSxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDckUsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFFNUIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFcEQsSUFBSSxDQUFDLElBQUksRUFBRTtZQUNULE9BQU87U0FDUjtRQUVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdEQsTUFBTSx1QkFBdUIsR0FDM0IsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDMUUsTUFBTSwwQkFBMEIsR0FDOUIsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRTNELElBQUksWUFBWSxJQUFJLHVCQUF1QixJQUFJLDBCQUEwQixFQUFFO1lBQ3pFLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1lBRXBCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUU3QyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLElBQUksQ0FBQyxjQUFjLEVBQUUsRUFBRTtnQkFDbkQsSUFBSSxDQUFDLGNBQWMsQ0FDakIsSUFBSSxDQUFDLGtCQUFrQixFQUFFO29CQUN2QixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUNoRSxDQUFDO2FBQ0g7WUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDakMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2pDLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3QyxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV2RCxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFekIsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLEVBQUU7Z0JBQ2xDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDckI7WUFFRCxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRTVCLHlCQUF5QixDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ2pDO0tBQ0Y7OztNQzVHVSxtQ0FBbUM7SUFHOUMsWUFBb0IsSUFBVTtRQUFWLFNBQUksR0FBSixJQUFJLENBQU07UUFDNUIsSUFBSSxDQUFDLDBCQUEwQjtZQUM3QixJQUFJLHVDQUF1QyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3JEO0lBRUQscUJBQXFCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDLHFCQUFxQixFQUFFLENBQUM7S0FDaEU7SUFFRCxZQUFZO1FBQ1YsT0FBTyxJQUFJLENBQUMsMEJBQTBCLENBQUMsWUFBWSxFQUFFLENBQUM7S0FDdkQ7SUFFRCxPQUFPO1FBQ0wsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQztRQUV0QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFO1lBQzNCLE9BQU87U0FDUjtRQUVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNoQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFbEMsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FDNUIsQ0FBQyxDQUFDLEtBQUssTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUMxRCxDQUFDO1FBRUYsSUFBSSxNQUFNLEtBQUssS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDL0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQzNDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsUUFBUSxFQUFFO2dCQUNiLE9BQU87YUFDUjtZQUNELElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLENBQUMsQ0FBQztZQUN4RCxJQUFJLENBQUMsMEJBQTBCLENBQUMsT0FBTyxFQUFFLENBQUM7U0FDM0M7YUFBTSxJQUFJLE1BQU0sSUFBSSxDQUFDLEVBQUU7WUFDdEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztTQUMzQztLQUNGOzs7TUM1Q1UsNEJBQTRCO0lBSXZDLFlBQW9CLElBQVU7UUFBVixTQUFJLEdBQUosSUFBSSxDQUFNO1FBSHRCLG9CQUFlLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLFlBQU8sR0FBRyxLQUFLLENBQUM7S0FFVTtJQUVsQyxxQkFBcUI7UUFDbkIsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDO0tBQzdCO0lBRUQsWUFBWTtRQUNWLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztLQUNyQjtJQUVELE9BQU87UUFDTCxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBRXRCLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUU7WUFDM0IsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDNUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFFcEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVuRSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUMzQyxNQUFNLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUNsQyxDQUFDO1FBRUYsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3hDOzs7TUN4QlUsZ0NBQWdDO0lBQzNDLFlBQ1UsTUFBZ0IsRUFDaEIsUUFBeUIsRUFDekIsR0FBZSxFQUNmLFFBQXlCLEVBQ3pCLGdCQUF5QztRQUp6QyxXQUFNLEdBQU4sTUFBTSxDQUFVO1FBQ2hCLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQ3pCLFFBQUcsR0FBSCxHQUFHLENBQVk7UUFDZixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUN6QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQXlCO1FBaUMzQyxVQUFLLEdBQUc7WUFDZCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztTQUM3RCxDQUFDO1FBRU0sbUNBQThCLEdBQUcsQ0FBQyxNQUFnQjtZQUN4RCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FDM0MsQ0FBQyxJQUFJLEtBQUssSUFBSSx1Q0FBdUMsQ0FBQyxJQUFJLENBQUMsRUFDM0QsTUFBTSxDQUNQLENBQUM7U0FDSCxDQUFDO1FBRU0sd0JBQW1CLEdBQUcsQ0FBQyxNQUFnQjtZQUM3QyxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FDM0MsQ0FBQyxJQUFJLEtBQUssSUFBSSw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsRUFDaEQsTUFBTSxDQUNQLENBQUM7U0FDSCxDQUFDO1FBRU0sK0JBQTBCLEdBQUcsQ0FBQyxNQUFnQjtZQUNwRCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FDM0MsQ0FBQyxJQUFJLEtBQUssSUFBSSxtQ0FBbUMsQ0FBQyxJQUFJLENBQUMsRUFDdkQsTUFBTSxDQUNQLENBQUM7U0FDSCxDQUFDO0tBdkRFO0lBRUUsSUFBSTs7WUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLHVCQUF1QixDQUNqQ0EsV0FBTSxDQUFDLEVBQUUsQ0FBQztnQkFDUjtvQkFDRSxHQUFHLEVBQUUsV0FBVztvQkFDaEIsR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7d0JBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzt3QkFDakIsR0FBRyxFQUFFLElBQUksQ0FBQyw4QkFBOEI7cUJBQ3pDLENBQUM7aUJBQ0g7Z0JBQ0Q7b0JBQ0UsR0FBRyxFQUFFLFFBQVE7b0JBQ2IsR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7d0JBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzt3QkFDakIsR0FBRyxFQUFFLElBQUksQ0FBQywwQkFBMEI7cUJBQ3JDLENBQUM7aUJBQ0g7Z0JBQ0Q7b0JBQ0UsR0FBRyxFQUFFLGFBQWE7b0JBQ2xCLEdBQUcsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDO3dCQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7d0JBQ2pCLEdBQUcsRUFBRSxJQUFJLENBQUMsbUJBQW1CO3FCQUM5QixDQUFDO2lCQUNIO2FBQ0YsQ0FBQyxDQUNILENBQUM7U0FDSDtLQUFBO0lBRUssTUFBTTsrREFBSztLQUFBOzs7TUNoRE4sa0NBQWtDO0lBSTdDLFlBQW9CLElBQVU7UUFBVixTQUFJLEdBQUosSUFBSSxDQUFNO1FBSHRCLG9CQUFlLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLFlBQU8sR0FBRyxLQUFLLENBQUM7S0FFVTtJQUVsQyxxQkFBcUI7UUFDbkIsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDO0tBQzdCO0lBRUQsWUFBWTtRQUNWLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztLQUNyQjtJQUVELE9BQU87UUFDTCxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBRXRCLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUU7WUFDM0IsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFFNUIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ3JELE1BQU0sVUFBVSxHQUNkLFlBQVksQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLElBQUk7Y0FDN0IsWUFBWSxDQUFDLEVBQUU7Y0FDZixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsTUFBTSxDQUFDO1FBRW5DLElBQUksTUFBTSxDQUFDLEVBQUUsR0FBRyxVQUFVLEVBQUU7WUFDMUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7WUFDcEIsSUFBSSxDQUFDLGFBQWEsQ0FBQztnQkFDakIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO2dCQUNqQixFQUFFLEVBQUUsVUFBVTthQUNmLENBQUMsQ0FBQztTQUNKO0tBQ0Y7OztNQ3RDVSxxQ0FBcUM7SUFJaEQsWUFBb0IsSUFBVTtRQUFWLFNBQUksR0FBSixJQUFJLENBQU07UUFIdEIsb0JBQWUsR0FBRyxLQUFLLENBQUM7UUFDeEIsWUFBTyxHQUFHLEtBQUssQ0FBQztLQUVVO0lBRWxDLHFCQUFxQjtRQUNuQixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUM7S0FDN0I7SUFFRCxZQUFZO1FBQ1YsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0tBQ3JCO0lBRUQsT0FBTztRQUNMLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFdEIsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRTtZQUMzQixPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUU1QixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFaEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDdkMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUNwQixPQUFPO1NBQ1I7UUFFRCxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDcEIsT0FBTyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsRUFBRTtZQUM3QixRQUFRLEdBQUcsUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1NBQ2pDO1FBRUQsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVuRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEdBQUcsWUFBWSxDQUFDLElBQUksRUFBRTtZQUNuQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztZQUNwQixJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO1NBQ2xDO0tBQ0Y7OztNQ2pDVSxnQ0FBZ0M7SUFDM0MsWUFDVSxNQUFnQixFQUNoQixRQUF5QixFQUN6QixRQUF5QixFQUN6QixnQkFBeUM7UUFIekMsV0FBTSxHQUFOLE1BQU0sQ0FBVTtRQUNoQixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUN6QixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUN6QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQXlCO1FBVzNDLHdCQUFtQixHQUFHLENBQUMsRUFBZTtZQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFO2dCQUMvQyxPQUFPLElBQUksQ0FBQzthQUNiO1lBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFL0QsWUFBWSxDQUFDO2dCQUNYLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUNuQyxDQUFDLENBQUM7WUFFSCxPQUFPLElBQUksQ0FBQztTQUNiLENBQUM7UUFFTSx5QkFBb0IsR0FBRyxDQUFDLE1BQWdCO1lBQzlDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FDcEMsQ0FBQyxJQUFJLEtBQUssSUFBSSxxQ0FBcUMsQ0FBQyxJQUFJLENBQUMsRUFDekQsTUFBTSxDQUNQLENBQUM7WUFFRixJQUFJLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQ3BDLENBQUMsSUFBSSxLQUFLLElBQUksa0NBQWtDLENBQUMsSUFBSSxDQUFDLEVBQ3RELE1BQU0sQ0FDUCxDQUFDO1NBQ0gsQ0FBQztLQWxDRTtJQUVFLElBQUk7O1lBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FDakNDLGlCQUFXLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUM3RCxDQUFDO1NBQ0g7S0FBQTtJQUVLLE1BQU07K0RBQUs7S0FBQTs7O01DckJOLGlCQUFpQjtJQUk1QixZQUFvQixJQUFVO1FBQVYsU0FBSSxHQUFKLElBQUksQ0FBTTtRQUh0QixvQkFBZSxHQUFHLEtBQUssQ0FBQztRQUN4QixZQUFPLEdBQUcsS0FBSyxDQUFDO0tBRVU7SUFFbEMscUJBQXFCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQztLQUM3QjtJQUVELFlBQVk7UUFDVixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7S0FDckI7SUFFRCxPQUFPO1FBQ0wsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQztRQUV0QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFO1lBQzNCLE9BQU87U0FDUjtRQUVELElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBRTVCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNoQyxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFdkMsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUVwQixNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxNQUFNLENBQUM7UUFDeEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUMsTUFBTSxDQUFDO1FBRXRELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekIsV0FBVyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFakQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEUsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLEdBQUcsbUJBQW1CLENBQUM7UUFDMUQsTUFBTSxNQUFNLEdBQUcsWUFBWSxHQUFHLFlBQVksQ0FBQztRQUUzQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUNqQixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksR0FBRyxRQUFRO1lBQzVCLEVBQUUsRUFBRSxNQUFNLENBQUMsRUFBRSxHQUFHLE1BQU07U0FDdkIsQ0FBQyxDQUFDO1FBRUgseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDakM7OztTQ3pEYSwwQkFBMEIsQ0FBQyxJQUFZO0lBQ3JELE9BQU8sSUFBSSxLQUFLLEVBQUUsSUFBSSxJQUFJLEtBQUssTUFBTSxDQUFDO0FBQ3hDOztNQ0lhLDZCQUE2QjtJQUd4QyxZQUFvQixJQUFVO1FBQVYsU0FBSSxHQUFKLElBQUksQ0FBTTtRQUM1QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDL0M7SUFFRCxxQkFBcUI7UUFDbkIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLHFCQUFxQixFQUFFLENBQUM7S0FDaEQ7SUFFRCxZQUFZO1FBQ1YsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVksRUFBRSxDQUFDO0tBQ3ZDO0lBRUQsT0FBTztRQUNMLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFdEIsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRTtZQUMzQixPQUFPO1NBQ1I7UUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUN2QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFOUIsSUFDRSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUM7WUFDaEIsQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsRUFDckI7WUFDQSxPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO0tBQzNCOzs7TUMzQlUsZ0NBQWdDO0lBQzNDLFlBQ1UsTUFBZ0IsRUFDaEIsUUFBeUIsRUFDekIsR0FBZSxFQUNmLFFBQXlCLEVBQ3pCLGdCQUF5QztRQUp6QyxXQUFNLEdBQU4sTUFBTSxDQUFVO1FBQ2hCLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQ3pCLFFBQUcsR0FBSCxHQUFHLENBQVk7UUFDZixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUN6QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQXlCO1FBcUIzQyxVQUFLLEdBQUc7WUFDZCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztTQUM3RCxDQUFDO1FBRU0sUUFBRyxHQUFHLENBQUMsTUFBZ0I7WUFDN0IsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQzNDLENBQUMsSUFBSSxLQUFLLElBQUksNkJBQTZCLENBQUMsSUFBSSxDQUFDLEVBQ2pELE1BQU0sQ0FDUCxDQUFDO1NBQ0gsQ0FBQztLQTdCRTtJQUVFLElBQUk7O1lBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FDakNDLFVBQUksQ0FBQyxPQUFPLENBQ1ZGLFdBQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ1I7b0JBQ0UsR0FBRyxFQUFFLE9BQU87b0JBQ1osR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7d0JBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzt3QkFDakIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO3FCQUNkLENBQUM7aUJBQ0g7YUFDRixDQUFDLENBQ0gsQ0FDRixDQUFDO1NBQ0g7S0FBQTtJQUVLLE1BQU07K0RBQUs7S0FBQTs7O1NDdENILE1BQU0sQ0FBQyxDQUFXLEVBQUUsQ0FBVztJQUM3QyxPQUFPLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDeEMsQ0FBQztTQUVlLE1BQU0sQ0FBQyxDQUFXLEVBQUUsQ0FBVztJQUM3QyxPQUFPLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDbEMsQ0FBQztTQUVlLE1BQU0sQ0FBQyxDQUFXLEVBQUUsQ0FBVztJQUM3QyxPQUFPLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDbEMsQ0FBQztNQWtCWSxJQUFJO0lBTWYsWUFDVSxJQUFVLEVBQ1YsTUFBYyxFQUNkLE1BQWMsRUFDZCxnQkFBd0IsRUFDaEMsU0FBaUIsRUFDVCxNQUFlO1FBTGYsU0FBSSxHQUFKLElBQUksQ0FBTTtRQUNWLFdBQU0sR0FBTixNQUFNLENBQVE7UUFDZCxXQUFNLEdBQU4sTUFBTSxDQUFRO1FBQ2QscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFRO1FBRXhCLFdBQU0sR0FBTixNQUFNLENBQVM7UUFYakIsV0FBTSxHQUFnQixJQUFJLENBQUM7UUFDM0IsYUFBUSxHQUFXLEVBQUUsQ0FBQztRQUN0QixnQkFBVyxHQUFrQixJQUFJLENBQUM7UUFDbEMsVUFBSyxHQUFhLEVBQUUsQ0FBQztRQVUzQixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztLQUM1QjtJQUVELGNBQWM7UUFDWixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7S0FDekI7SUFFRCxjQUFjLENBQUMsV0FBbUI7UUFDaEMsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLElBQUksRUFBRTtZQUM3QixNQUFNLElBQUksS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUM7U0FDbEQ7UUFDRCxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztLQUNoQztJQUVELE9BQU8sQ0FBQyxJQUFZO1FBQ2xCLElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxJQUFJLEVBQUU7WUFDN0IsTUFBTSxJQUFJLEtBQUssQ0FDYiwyREFBMkQsQ0FDNUQsQ0FBQztTQUNIO1FBRUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDdkI7SUFFRCxZQUFZLENBQUMsS0FBZTtRQUMxQixJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssSUFBSSxFQUFFO1lBQ2pELE1BQU0sSUFBSSxLQUFLLENBQ2IsMkRBQTJELENBQzVELENBQUM7U0FDSDtRQUVELElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0tBQ3BCO0lBRUQsWUFBWTtRQUNWLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7S0FDMUI7SUFFRCxPQUFPO1FBQ0wsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDO0tBQ2xCO0lBRUQsV0FBVztRQUNULE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztLQUMvQjtJQUVELFlBQVk7UUFDVixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTVELE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUMzQixNQUFNLElBQUksR0FBRyxTQUFTLEdBQUcsQ0FBQyxDQUFDO1lBQzNCLE1BQU0sT0FBTyxHQUNYLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUM7WUFDL0QsTUFBTSxLQUFLLEdBQUcsT0FBTyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7WUFFbkMsT0FBTztnQkFDTCxJQUFJLEVBQUUsR0FBRztnQkFDVCxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRTtnQkFDM0IsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUU7YUFDeEIsQ0FBQztTQUNILENBQUMsQ0FBQztLQUNKO0lBRUQsUUFBUTtRQUNOLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztLQUM1QjtJQUVELHdCQUF3QjtRQUN0QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTVELE9BQU87WUFDTCxJQUFJLEVBQUUsU0FBUztZQUNmLEVBQUUsRUFBRSxJQUFJLENBQUMsaUJBQWlCLEVBQUU7U0FDN0IsQ0FBQztLQUNIO0lBRUQscUJBQXFCO1FBQ25CLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUQsTUFBTSxLQUFLLEdBQ1QsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQztjQUNuQixJQUFJLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU07Y0FDL0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFFekUsT0FBTztZQUNMLElBQUksRUFBRSxPQUFPO1lBQ2IsRUFBRSxFQUFFLEtBQUs7U0FDVixDQUFDO0tBQ0g7SUFFTyxpQkFBaUI7UUFDdkIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7S0FDcEQ7SUFFRCxRQUFRO1FBQ04sSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ2YsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUVELElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNmLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztTQUMvQjtRQUVELE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxVQUFVO1FBQ1IsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRTlCLE9BQU8sTUFBTSxFQUFFO1lBQ2IsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFO2dCQUNqQixPQUFPLEtBQUssQ0FBQzthQUNkO1lBRUQsTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztTQUM3QjtRQUVELE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztLQUNwQjtJQUVELFFBQVE7UUFDTixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNoQixPQUFPLENBQUMsQ0FBQztTQUNWO1FBRUQsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztLQUNuQztJQUVELGVBQWUsQ0FBQyxJQUFZLEVBQUUsSUFBWTtRQUN4QyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuRSxJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssSUFBSSxFQUFFO1lBQzdCLElBQUksQ0FBQyxXQUFXO2dCQUNkLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUNsRTtRQUVELEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNqQyxLQUFLLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztTQUNuQztLQUNGO0lBRUQsYUFBYSxDQUFDLFNBQWlCLEVBQUUsV0FBbUI7UUFDbEQsSUFBSSxDQUFDLE1BQU07WUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDO2dCQUMvQixXQUFXO2dCQUNYLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQy9CLElBQUksSUFBSSxDQUFDLFdBQVcsS0FBSyxJQUFJLEVBQUU7WUFDN0IsSUFBSSxDQUFDLFdBQVc7Z0JBQ2QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQztvQkFDcEMsV0FBVztvQkFDWCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztTQUNyQztRQUVELEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNqQyxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztTQUM3QztLQUNGO0lBRUQsa0JBQWtCO1FBQ2hCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztLQUNwQjtJQUVELFNBQVM7UUFDUCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7S0FDcEI7SUFFRCxtQkFBbUI7UUFDakIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7S0FDOUI7SUFFRCxhQUFhLENBQUMsTUFBYztRQUMxQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztLQUN0QjtJQUVELFNBQVM7UUFDUCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7S0FDcEI7SUFFRCxZQUFZLENBQUMsSUFBVTtRQUNyQixJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztLQUNwQjtJQUVELFdBQVcsQ0FBQyxJQUFVO1FBQ3BCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO0tBQ3BCO0lBRUQsV0FBVyxDQUFDLElBQVU7UUFDcEIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO0tBQ3BCO0lBRUQsU0FBUyxDQUFDLE1BQVksRUFBRSxJQUFVO1FBQ2hDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDakMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7S0FDcEI7SUFFRCxRQUFRLENBQUMsTUFBWSxFQUFFLElBQVU7UUFDL0IsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7S0FDcEI7SUFFRCxnQkFBZ0IsQ0FBQyxJQUFVO1FBQ3pCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUM7S0FDNUM7SUFFRCxnQkFBZ0IsQ0FBQyxJQUFVO1FBQ3pCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO0tBQ3pFO0lBRUQsT0FBTztRQUNMLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO0tBQ25DO0lBRUQsS0FBSztRQUNILElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUViLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUMxQyxHQUFHO2dCQUNELENBQUMsS0FBSyxDQUFDO3NCQUNILElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsZ0JBQWdCO3NCQUNqRCxJQUFJLENBQUMsV0FBVyxDQUFDO1lBQ3ZCLEdBQUcsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JCLEdBQUcsSUFBSSxJQUFJLENBQUM7U0FDYjtRQUVELEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNqQyxHQUFHLElBQUksS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1NBQ3RCO1FBRUQsT0FBTyxHQUFHLENBQUM7S0FDWjtDQUNGO01BRVksSUFBSTtJQUlmLFlBQ1UsS0FBZSxFQUNmLEdBQWEsRUFDckIsVUFBbUI7UUFGWCxVQUFLLEdBQUwsS0FBSyxDQUFVO1FBQ2YsUUFBRyxHQUFILEdBQUcsQ0FBVTtRQUxmLGFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELGVBQVUsR0FBWSxFQUFFLENBQUM7UUFPL0IsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0tBQ3BDO0lBRUQsV0FBVztRQUNULE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztLQUN0QjtJQUVELFFBQVE7UUFDTixPQUFPLG1CQUFNLElBQUksQ0FBQyxLQUFLLHFCQUFTLElBQUksQ0FBQyxHQUFHLEVBQUcsQ0FBQztLQUM3QztJQUVELGFBQWE7UUFDWCxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNO1lBQ2pDLE1BQU0sb0JBQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBRTtZQUN2QixJQUFJLG9CQUFPLENBQUMsQ0FBQyxJQUFJLENBQUU7U0FDcEIsQ0FBQyxDQUFDLENBQUM7S0FDTDtJQUVELGVBQWU7UUFDYixJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEVBQUU7WUFDOUIsT0FBTyxLQUFLLENBQUM7U0FDZDtRQUVELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFckMsUUFDRSxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUk7WUFDN0MsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQ3pDO0tBQ0g7SUFFRCxrQkFBa0I7UUFDaEIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUM7S0FDckM7SUFFRCxTQUFTO1FBQ1AseUJBQVksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUc7S0FDaEU7SUFFRCxhQUFhLENBQUMsTUFBZ0I7UUFDNUIsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztLQUN0RDtJQUVELGlCQUFpQixDQUFDLFVBQW1CO1FBQ25DLElBQUksVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDekIsTUFBTSxJQUFJLEtBQUssQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1NBQzdEO1FBQ0QsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7S0FDOUI7SUFFRCxrQkFBa0I7UUFDaEIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3JEO0lBRUQsZ0JBQWdCLENBQUMsSUFBWTtRQUMzQixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7WUFDbEQsT0FBTztTQUNSO1FBRUQsSUFBSSxNQUFNLEdBQVMsSUFBSSxDQUFDO1FBQ3hCLElBQUksS0FBSyxHQUFXLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBRXBDLE1BQU0sUUFBUSxHQUFHLENBQUMsRUFBVTtZQUMxQixLQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRTtnQkFDbEIsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDO2dCQUMzQixNQUFNLFlBQVksR0FBRyxZQUFZLEdBQUcsQ0FBQyxDQUFDLFlBQVksRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFFekQsSUFBSSxJQUFJLElBQUksWUFBWSxJQUFJLElBQUksSUFBSSxZQUFZLEVBQUU7b0JBQ2hELE1BQU0sR0FBRyxDQUFDLENBQUM7aUJBQ1o7cUJBQU07b0JBQ0wsS0FBSyxHQUFHLFlBQVksR0FBRyxDQUFDLENBQUM7b0JBQ3pCLFFBQVEsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztpQkFDM0I7Z0JBQ0QsSUFBSSxNQUFNLEtBQUssSUFBSSxFQUFFO29CQUNuQixPQUFPO2lCQUNSO2FBQ0Y7U0FDRixDQUFDO1FBRUYsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUV0QyxPQUFPLE1BQU0sQ0FBQztLQUNmO0lBRUQsc0JBQXNCLENBQUMsSUFBVTtRQUMvQixJQUFJLE1BQU0sR0FBNEIsSUFBSSxDQUFDO1FBQzNDLElBQUksSUFBSSxHQUFXLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBRW5DLE1BQU0sUUFBUSxHQUFHLENBQUMsRUFBVTtZQUMxQixLQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRTtnQkFDbEIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDO2dCQUMxQixNQUFNLFlBQVksR0FBRyxZQUFZLEdBQUcsQ0FBQyxDQUFDLFlBQVksRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFFekQsSUFBSSxDQUFDLEtBQUssSUFBSSxFQUFFO29CQUNkLE1BQU0sR0FBRyxDQUFDLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQztpQkFDdkM7cUJBQU07b0JBQ0wsSUFBSSxHQUFHLFlBQVksR0FBRyxDQUFDLENBQUM7b0JBQ3hCLFFBQVEsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztpQkFDM0I7Z0JBRUQsSUFBSSxNQUFNLEtBQUssSUFBSSxFQUFFO29CQUNuQixPQUFPO2lCQUNSO2FBQ0Y7U0FDRixDQUFDO1FBRUYsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUV0QyxPQUFPLE1BQU0sQ0FBQztLQUNmO0lBRUQsV0FBVztRQUNULE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztLQUNwQztJQUVELEtBQUs7UUFDSCxJQUFJLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFFYixLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLEVBQUU7WUFDL0MsR0FBRyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUN0QjtRQUVELE9BQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7S0FDL0I7OztNQ3RaVSxzQkFBc0I7SUFJakMsWUFBb0IsSUFBVTtRQUFWLFNBQUksR0FBSixJQUFJLENBQU07UUFIdEIsb0JBQWUsR0FBRyxLQUFLLENBQUM7UUFDeEIsWUFBTyxHQUFHLEtBQUssQ0FBQztLQUVVO0lBRWxDLHFCQUFxQjtRQUNuQixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUM7S0FDN0I7SUFFRCxZQUFZO1FBQ1YsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0tBQ3JCO0lBRUQsT0FBTztRQUNMLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFdEIsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRTtZQUMzQixPQUFPO1NBQ1I7UUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUN2QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFbEMsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSwwQkFBMEIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDbkUsT0FBTztTQUNSO1FBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXZFLElBQUksTUFBTSxDQUFDLEVBQUUsR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRTtZQUN2QyxPQUFPO1NBQ1I7UUFFRCxNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQ3pDLENBQUMsR0FBRyxFQUFFLElBQUk7WUFDUixJQUFJLE1BQU0sQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ2hDLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUM5QjtpQkFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ3pDLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3ZELE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDcEQsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JCLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ3RCO2lCQUFNLElBQUksTUFBTSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRTtnQkFDdkMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQzlCO1lBRUQsT0FBTyxHQUFHLENBQUM7U0FDWixFQUNEO1lBQ0UsUUFBUSxFQUFFLEVBQUU7WUFDWixRQUFRLEVBQUUsRUFBRTtTQUNiLENBQ0YsQ0FBQztRQUVGLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUN0RSxNQUFNLGlCQUFpQixHQUNyQixpQkFBaUIsR0FBRyxDQUFDLElBQUksaUJBQWlCLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV2RCxJQUFJLGlCQUFpQixFQUFFO1lBQ3JCLE9BQU87U0FDUjtRQUVELElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBQzVCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1FBRXBCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzVDLE1BQU0sWUFBWSxHQUNoQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLEVBQUUsS0FBSyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBRTVFLE1BQU0sTUFBTSxHQUFHLFlBQVk7Y0FDdkIsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixFQUFFO2NBQzFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBRTlCLE1BQU0sTUFBTSxHQUFHLFlBQVk7Y0FDdkIsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRTtjQUNqQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFckIsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZO2NBQ2pDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRTtjQUMzQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUUvQixNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxHQUFHLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFFNUQsTUFBTSxPQUFPLEdBQUcsSUFBSSxJQUFJLENBQ3RCLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFDZCxNQUFNLEVBQ04sTUFBTSxFQUNOLGdCQUFnQixFQUNoQixNQUFNLEdBQUcsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUN6QixLQUFLLENBQ04sQ0FBQztRQUVGLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDdkIsT0FBTyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztZQUM5QyxLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsRUFBRTtnQkFDM0IsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUN2QjtTQUNGO1FBRUQsSUFBSSxZQUFZLEVBQUU7WUFDaEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztTQUM1QjthQUFNO1lBQ0wsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3BDLEtBQUssTUFBTSxLQUFLLElBQUksUUFBUSxFQUFFO2dCQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN4QixPQUFPLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQzVCO1lBRUQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7U0FDMUM7UUFFRCxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTVCLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ3hELElBQUksQ0FBQyxhQUFhLENBQUM7WUFDakIsSUFBSSxFQUFFLFlBQVksQ0FBQyxJQUFJO1lBQ3ZCLEVBQUUsRUFBRSxZQUFZLENBQUMsRUFBRSxHQUFHLE1BQU0sQ0FBQyxNQUFNO1NBQ3BDLENBQUMsQ0FBQztRQUVILHlCQUF5QixDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2pDOzs7TUNuSFUsK0JBQStCO0lBQzFDLFlBQ1UsTUFBZ0IsRUFDaEIsUUFBeUIsRUFDekIsR0FBZSxFQUNmLFFBQXlCLEVBQ3pCLGdCQUF5QztRQUp6QyxXQUFNLEdBQU4sTUFBTSxDQUFVO1FBQ2hCLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQ3pCLFFBQUcsR0FBSCxHQUFHLENBQVk7UUFDZixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUN6QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQXlCO1FBcUIzQyxVQUFLLEdBQUc7WUFDZCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztTQUM3RCxDQUFDO1FBRU0sUUFBRyxHQUFHLENBQUMsTUFBZ0I7WUFDN0IsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQzNDLENBQUMsSUFBSSxLQUFLLElBQUksc0JBQXNCLENBQUMsSUFBSSxDQUFDLEVBQzFDLE1BQU0sQ0FDUCxDQUFDO1NBQ0gsQ0FBQztLQTdCRTtJQUVFLElBQUk7O1lBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FDakNFLFVBQUksQ0FBQyxPQUFPLENBQ1ZGLFdBQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ1I7b0JBQ0UsR0FBRyxFQUFFLE9BQU87b0JBQ1osR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7d0JBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzt3QkFDakIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO3FCQUNkLENBQUM7aUJBQ0g7YUFDRixDQUFDLENBQ0gsQ0FDRixDQUFDO1NBQ0g7S0FBQTtJQUVLLE1BQU07K0RBQUs7S0FBQTs7O01DL0JOLFdBQVc7SUFDdEIsWUFBb0IsTUFBZ0IsRUFBVSxRQUF5QjtRQUFuRCxXQUFNLEdBQU4sTUFBTSxDQUFVO1FBQVUsYUFBUSxHQUFSLFFBQVEsQ0FBaUI7UUFrRC9ELFNBQUksR0FBRyxDQUFDLE1BQWdCO1lBQzlCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7U0FDckMsQ0FBQztRQUVNLFdBQU0sR0FBRyxDQUFDLE1BQWdCO1lBQ2hDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7U0FDdkMsQ0FBQztLQXhEeUU7SUFFckUsSUFBSTs7WUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQztnQkFDckIsRUFBRSxFQUFFLE1BQU07Z0JBQ1YsSUFBSSxFQUFFLGVBQWU7Z0JBQ3JCLGNBQWMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7Z0JBQzdELE9BQU8sRUFBRTtvQkFDUDt3QkFDRSxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUM7d0JBQ2xCLEdBQUcsRUFBRSxTQUFTO3FCQUNmO2lCQUNGO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7Z0JBQ3JCLEVBQUUsRUFBRSxRQUFRO2dCQUNaLElBQUksRUFBRSxpQkFBaUI7Z0JBQ3ZCLGNBQWMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7Z0JBQy9ELE9BQU8sRUFBRTtvQkFDUDt3QkFDRSxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUM7d0JBQ2xCLEdBQUcsRUFBRSxXQUFXO3FCQUNqQjtpQkFDRjthQUNGLENBQUMsQ0FBQztTQUNKO0tBQUE7SUFFSyxNQUFNOytEQUFLO0tBQUE7SUFFVCxPQUFPLENBQUMsTUFBZ0IsRUFBRSxJQUF1QjtRQUN2RCxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLFVBQVUsRUFBRTtZQUN2RCxJQUFJRyxlQUFNLENBQ1IsYUFBYSxJQUFJLGlGQUFpRixFQUNsRyxJQUFJLENBQ0wsQ0FBQztZQUNGLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFbEMsSUFBSSxJQUFJLEtBQUssTUFBTSxFQUFFO1lBQ25CLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQzFCO2FBQU07WUFDTCxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUM1QjtRQUVELE9BQU8sSUFBSSxDQUFDO0tBQ2I7OztBQ25ESCxNQUFNLGtCQUFrQixHQUFHLDhCQUE4QixDQUFDO0FBQzFELE1BQU0sb0JBQW9CLEdBQUcsZ0NBQWdDLENBQUM7QUFDOUQsTUFBTSxvQkFBb0IsR0FBRyxnQ0FBZ0MsQ0FBQztBQUM5RCxNQUFNLGFBQWEsR0FBRztJQUNwQixrQkFBa0I7SUFDbEIsb0JBQW9CO0lBQ3BCLG9CQUFvQjtDQUNyQixDQUFDO01BRVcsa0JBQWtCO0lBRzdCLFlBQ1UsUUFBeUIsRUFDekIsUUFBeUI7UUFEekIsYUFBUSxHQUFSLFFBQVEsQ0FBaUI7UUFDekIsYUFBUSxHQUFSLFFBQVEsQ0FBaUI7UUFlM0Isb0JBQWUsR0FBRztZQUN4QixJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLEVBQUU7Z0JBQ3ZFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDMUIsT0FBTzthQUNSO1lBRUQsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUU1RCxJQUFJLENBQUMsZ0JBQWdCLENBQUM7Z0JBQ3BCLGtCQUFrQjtnQkFDbEIsb0JBQW9CO2dCQUNwQixPQUFPLEtBQUssQ0FBQyxHQUFHLG9CQUFvQixHQUFHLElBQUk7YUFDNUMsQ0FBQyxDQUFDO1NBQ0osQ0FBQztLQTNCRTtJQUVFLElBQUk7O1lBQ1IsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQztnQkFDakMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2FBQ3hCLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDVjtLQUFBO0lBRUssTUFBTTs7WUFDVixhQUFhLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzdCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUMzQjtLQUFBO0lBaUJPLGdCQUFnQixDQUFDLE9BQWlCO1FBQ3hDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFbEUsS0FBSyxNQUFNLENBQUMsSUFBSSxNQUFNLEVBQUU7WUFDdEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDeEMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ2hDO1NBQ0Y7UUFFRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLFFBQVEsRUFBRTtZQUN4QixJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDdkMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ25DO1NBQ0Y7S0FDRjs7O01DNURVLHlDQUF5QztJQUlwRCxZQUFvQixJQUFVO1FBQVYsU0FBSSxHQUFKLElBQUksQ0FBTTtRQUh0QixvQkFBZSxHQUFHLEtBQUssQ0FBQztRQUN4QixZQUFPLEdBQUcsS0FBSyxDQUFDO0tBRVU7SUFFbEMscUJBQXFCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQztLQUM3QjtJQUVELFlBQVk7UUFDVixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7S0FDckI7SUFFRCxPQUFPO1FBQ0wsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQztRQUV0QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFO1lBQzNCLE9BQU87U0FDUjtRQUVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUM1QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3JDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsU0FBUyxDQUM1QixDQUFDLENBQUMsS0FBSyxNQUFNLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQzlELENBQUM7UUFFRixJQUFJLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDaEIsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztTQUNyRDthQUFNLElBQUksTUFBTSxHQUFHLENBQUMsRUFBRTtZQUNyQixJQUFJLENBQUMsNEJBQTRCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztTQUN4RDtLQUNGO0lBRU8sNEJBQTRCLENBQ2xDLElBQVUsRUFDVixLQUFpQixFQUNqQixNQUFjO1FBRWQsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDNUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFFcEIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQzFDO0lBRU8sZ0NBQWdDLENBQUMsSUFBVSxFQUFFLE1BQWdCO1FBQ25FLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRXBELElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDVCxPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUM1QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUVwQixJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUNuQixJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDcEIsT0FBTyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsRUFBRTtnQkFDN0IsUUFBUSxHQUFHLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQzthQUNqQztZQUVELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDbkQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQztTQUNsQzthQUFNO1lBQ0wsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO1NBQ2xEO0tBQ0Y7OztNQzNEVSx1Q0FBdUM7SUFDbEQsWUFDVSxNQUFnQixFQUNoQixRQUF5QixFQUN6QixHQUFlLEVBQ2YsUUFBeUIsRUFDekIsZ0JBQXlDO1FBSnpDLFdBQU0sR0FBTixNQUFNLENBQVU7UUFDaEIsYUFBUSxHQUFSLFFBQVEsQ0FBaUI7UUFDekIsUUFBRyxHQUFILEdBQUcsQ0FBWTtRQUNmLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQ3pCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBeUI7UUEyQjNDLFVBQUssR0FBRztZQUNkLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO1NBQzdELENBQUM7UUFFTSxRQUFHLEdBQUcsQ0FBQyxNQUFnQjtZQUM3QixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FDM0MsQ0FBQyxJQUFJLEtBQUssSUFBSSx5Q0FBeUMsQ0FBQyxJQUFJLENBQUMsRUFDN0QsTUFBTSxDQUNQLENBQUM7U0FDSCxDQUFDO0tBbkNFO0lBRUUsSUFBSTs7WUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLHVCQUF1QixDQUNqQ0gsV0FBTSxDQUFDLEVBQUUsQ0FBQztnQkFDUjtvQkFDRSxHQUFHLEVBQUUsV0FBVztvQkFDaEIsR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7d0JBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzt3QkFDakIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO3FCQUNkLENBQUM7aUJBQ0g7Z0JBQ0Q7b0JBQ0UsR0FBRyxFQUFFLGFBQWE7b0JBQ2xCLEtBQUssRUFBRSxhQUFhO29CQUNwQixHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQzt3QkFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO3dCQUNqQixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7cUJBQ2QsQ0FBQztpQkFDSDthQUNGLENBQUMsQ0FDSCxDQUFDO1NBQ0g7S0FBQTtJQUVLLE1BQU07K0RBQUs7S0FBQTs7O01DdENOLGlCQUFpQjtJQUk1QixZQUFvQixJQUFVO1FBQVYsU0FBSSxHQUFKLElBQUksQ0FBTTtRQUh0QixvQkFBZSxHQUFHLEtBQUssQ0FBQztRQUN4QixZQUFPLEdBQUcsS0FBSyxDQUFDO0tBRVU7SUFFbEMscUJBQXFCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQztLQUM3QjtJQUVELFlBQVk7UUFDVixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7S0FDckI7SUFFRCxPQUFPO1FBQ0wsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQztRQUV0QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFO1lBQzNCLE9BQU87U0FDUjtRQUVELElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBRTVCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNoQyxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDdkMsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTNDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWpFLElBQUksQ0FBQyxJQUFJLElBQUksV0FBVyxFQUFFO1lBQ3hCLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUV2RCxJQUFJLFNBQVMsRUFBRTtnQkFDYixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztnQkFDcEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDekIsU0FBUyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUM5QjtTQUNGO2FBQU0sSUFBSSxJQUFJLEVBQUU7WUFDZixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztZQUNwQixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pCLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQzdCO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDakIsT0FBTztTQUNSO1FBRUQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEUsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLEdBQUcsbUJBQW1CLENBQUM7UUFFMUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDakIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEdBQUcsUUFBUTtZQUM1QixFQUFFLEVBQUUsTUFBTSxDQUFDLEVBQUU7U0FDZCxDQUFDLENBQUM7UUFFSCx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNqQzs7O01DMURVLGtCQUFrQjtJQUk3QixZQUFvQixJQUFVLEVBQVUsa0JBQTBCO1FBQTlDLFNBQUksR0FBSixJQUFJLENBQU07UUFBVSx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQVE7UUFIMUQsb0JBQWUsR0FBRyxLQUFLLENBQUM7UUFDeEIsWUFBTyxHQUFHLEtBQUssQ0FBQztLQUU4QztJQUV0RSxxQkFBcUI7UUFDbkIsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDO0tBQzdCO0lBRUQsWUFBWTtRQUNWLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztLQUNyQjtJQUVELE9BQU87UUFDTCxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBRXRCLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUU7WUFDM0IsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFFNUIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDdkMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUzQyxJQUFJLENBQUMsSUFBSSxFQUFFO1lBQ1QsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFFcEIsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFakUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUMsTUFBTSxDQUFDO1FBQ25ELElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQztRQUVyQixJQUFJLFdBQVcsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDekMsV0FBVyxHQUFHLElBQUk7aUJBQ2YsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO2lCQUNoQixrQkFBa0IsRUFBRTtpQkFDcEIsS0FBSyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQzVDO1FBRUQsSUFBSSxXQUFXLEtBQUssRUFBRSxFQUFFO1lBQ3RCLFdBQVcsR0FBRyxJQUFJO2lCQUNmLGtCQUFrQixFQUFFO2lCQUNwQixLQUFLLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDOUM7UUFFRCxJQUFJLFdBQVcsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDekMsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1NBQzFEO1FBRUQsSUFBSSxXQUFXLEtBQUssRUFBRSxFQUFFO1lBQ3RCLFdBQVcsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUM7U0FDdkM7UUFFRCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFM0MsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEUsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLEdBQUcsbUJBQW1CLENBQUM7UUFFMUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDakIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEdBQUcsUUFBUTtZQUM1QixFQUFFLEVBQUUsTUFBTSxDQUFDLEVBQUUsR0FBRyxXQUFXLENBQUMsTUFBTTtTQUNuQyxDQUFDLENBQUM7UUFFSCx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNqQzs7O01DekVVLGVBQWU7SUFJMUIsWUFBb0IsSUFBVTtRQUFWLFNBQUksR0FBSixJQUFJLENBQU07UUFIdEIsb0JBQWUsR0FBRyxLQUFLLENBQUM7UUFDeEIsWUFBTyxHQUFHLEtBQUssQ0FBQztLQUVVO0lBRWxDLHFCQUFxQjtRQUNuQixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUM7S0FDN0I7SUFFRCxZQUFZO1FBQ1YsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0tBQ3JCO0lBRUQsT0FBTztRQUNMLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFdEIsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRTtZQUMzQixPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUU1QixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUN2QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEMsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUzQyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVqRSxJQUFJLENBQUMsSUFBSSxJQUFJLFdBQVcsRUFBRTtZQUN4QixNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFdkQsSUFBSSxTQUFTLEVBQUU7Z0JBQ2IsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7Z0JBQ3BCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3pCLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDN0I7U0FDRjthQUFNLElBQUksSUFBSSxFQUFFO1lBQ2YsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7WUFDcEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QixNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztTQUM5QjtRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ2pCLE9BQU87U0FDUjtRQUVELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sUUFBUSxHQUFHLGtCQUFrQixHQUFHLG1CQUFtQixDQUFDO1FBRTFELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNoQyxJQUFJLENBQUMsYUFBYSxDQUFDO1lBQ2pCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxHQUFHLFFBQVE7WUFDNUIsRUFBRSxFQUFFLE1BQU0sQ0FBQyxFQUFFO1NBQ2QsQ0FBQyxDQUFDO1FBRUgseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDakM7OztNQy9DVSxnQkFBZ0I7SUFDM0IsWUFDVSxNQUFnQixFQUNoQixHQUFlLEVBQ2YsUUFBeUIsRUFDekIsUUFBeUIsRUFDekIsZ0JBQXlDO1FBSnpDLFdBQU0sR0FBTixNQUFNLENBQVU7UUFDaEIsUUFBRyxHQUFILEdBQUcsQ0FBWTtRQUNmLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQ3pCLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQ3pCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBeUI7UUEwRTNDLFVBQUssR0FBRztZQUNkLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO1NBQzNELENBQUM7UUFFTSwrQkFBMEIsR0FBRyxDQUFDLE1BQWdCO1lBQ3BELE1BQU0sRUFBRSxxQkFBcUIsRUFBRSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FDdEUsQ0FBQyxJQUFJLEtBQUssSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFDckMsTUFBTSxDQUNQLENBQUM7WUFFRixPQUFPLHFCQUFxQixDQUFDO1NBQzlCLENBQUM7UUFFTSw2QkFBd0IsR0FBRyxDQUFDLE1BQWdCO1lBQ2xELE1BQU0sRUFBRSxxQkFBcUIsRUFBRSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FDdEUsQ0FBQyxJQUFJLEtBQUssSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQ25DLE1BQU0sQ0FDUCxDQUFDO1lBRUYsT0FBTyxxQkFBcUIsQ0FBQztTQUM5QixDQUFDO1FBRU0sZ0NBQTJCLEdBQUcsQ0FBQyxNQUFnQjtZQUNyRCxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEVBQUU7Z0JBQzFCLE9BQU8sSUFBSSxDQUFDO2FBQ2I7WUFFRCxPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztTQUNoRSxDQUFDO1FBRU0seUJBQW9CLEdBQUcsQ0FBQyxNQUFnQjtZQUM5QyxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FDM0MsQ0FBQyxJQUFJLEtBQ0gsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLEVBQ3JFLE1BQU0sQ0FDUCxDQUFDO1NBQ0gsQ0FBQztRQUVNLCtCQUEwQixHQUFHLENBQUMsTUFBZ0I7WUFDcEQsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxFQUFFO2dCQUMxQixPQUFPLElBQUksQ0FBQzthQUNiO1lBRUQsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUMscUJBQXFCLENBQUM7U0FDL0QsQ0FBQztRQUVNLHdCQUFtQixHQUFHLENBQUMsTUFBZ0I7WUFDN0MsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQzNDLENBQUMsSUFBSSxLQUFLLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQ3JDLE1BQU0sQ0FDUCxDQUFDO1NBQ0gsQ0FBQztLQTVIRTtJQUVFLElBQUk7O1lBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7Z0JBQ3JCLEVBQUUsRUFBRSxtQkFBbUI7Z0JBQ3ZCLElBQUksRUFBRSwyQkFBMkI7Z0JBQ2pDLGNBQWMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUNoRCxJQUFJLENBQUMsd0JBQXdCLENBQzlCO2dCQUNELE9BQU8sRUFBRTtvQkFDUDt3QkFDRSxTQUFTLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDO3dCQUMzQixHQUFHLEVBQUUsU0FBUztxQkFDZjtpQkFDRjthQUNGLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO2dCQUNyQixFQUFFLEVBQUUscUJBQXFCO2dCQUN6QixJQUFJLEVBQUUsNkJBQTZCO2dCQUNuQyxjQUFjLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FDaEQsSUFBSSxDQUFDLDBCQUEwQixDQUNoQztnQkFDRCxPQUFPLEVBQUU7b0JBQ1A7d0JBQ0UsU0FBUyxFQUFFLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQzt3QkFDM0IsR0FBRyxFQUFFLFdBQVc7cUJBQ2pCO2lCQUNGO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7Z0JBQ3JCLEVBQUUsRUFBRSxhQUFhO2dCQUNqQixJQUFJLEVBQUUsOEJBQThCO2dCQUNwQyxjQUFjLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FDaEQsSUFBSSxDQUFDLDJCQUEyQixDQUNqQztnQkFDRCxPQUFPLEVBQUUsRUFBRTthQUNaLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDO2dCQUNyQixFQUFFLEVBQUUsY0FBYztnQkFDbEIsSUFBSSxFQUFFLCtCQUErQjtnQkFDckMsY0FBYyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQ2hELElBQUksQ0FBQywwQkFBMEIsQ0FDaEM7Z0JBQ0QsT0FBTyxFQUFFLEVBQUU7YUFDWixDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsTUFBTSxDQUFDLHVCQUF1QixDQUNqQ0UsVUFBSSxDQUFDLE9BQU8sQ0FDVkYsV0FBTSxDQUFDLEVBQUUsQ0FBQztnQkFDUjtvQkFDRSxHQUFHLEVBQUUsS0FBSztvQkFDVixHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQzt3QkFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO3dCQUNqQixHQUFHLEVBQUUsSUFBSSxDQUFDLG9CQUFvQjtxQkFDL0IsQ0FBQztpQkFDSDtnQkFDRDtvQkFDRSxHQUFHLEVBQUUsT0FBTztvQkFDWixHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQzt3QkFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO3dCQUNqQixHQUFHLEVBQUUsSUFBSSxDQUFDLG1CQUFtQjtxQkFDOUIsQ0FBQztpQkFDSDthQUNGLENBQUMsQ0FDSCxDQUNGLENBQUM7U0FDSDtLQUFBO0lBRUssTUFBTTsrREFBSztLQUFBOzs7TUMxRk4sa0JBQWtCO0lBSTdCLFlBQW9CLElBQVU7UUFBVixTQUFJLEdBQUosSUFBSSxDQUFNO1FBSHRCLG9CQUFlLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLFlBQU8sR0FBRyxLQUFLLENBQUM7S0FFVTtJQUVsQyxxQkFBcUI7UUFDbkIsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDO0tBQzdCO0lBRUQsWUFBWTtRQUNWLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztLQUNyQjtJQUVELE9BQU87UUFDTCxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBRXRCLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsRUFBRTtZQUM5QixPQUFPO1NBQ1I7UUFFRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFN0MsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQy9ELE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUU3RCxJQUNFLGFBQWEsQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDLElBQUk7WUFDbkMsV0FBVyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxFQUMvQjtZQUNBLE9BQU8sS0FBSyxDQUFDO1NBQ2Q7UUFFRCxJQUNFLGFBQWEsQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLElBQUk7WUFDckMsYUFBYSxDQUFDLEVBQUUsS0FBSyxTQUFTLENBQUMsRUFBRTtZQUNqQyxXQUFXLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxJQUFJO1lBQ2pDLFdBQVcsQ0FBQyxFQUFFLEtBQUssT0FBTyxDQUFDLEVBQUUsRUFDN0I7WUFDQSxPQUFPLEtBQUssQ0FBQztTQUNkO1FBRUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDdkMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixFQUFFLENBQUM7UUFDckQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFFaEQsSUFDRSxhQUFhLENBQUMsSUFBSSxHQUFHLFlBQVksQ0FBQyxJQUFJO1lBQ3RDLFdBQVcsQ0FBQyxJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksRUFDbEM7WUFDQSxPQUFPLEtBQUssQ0FBQztTQUNkO1FBRUQsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDNUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFFcEIsSUFDRSxhQUFhLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQyxJQUFJO1lBQ3hDLGFBQWEsQ0FBQyxFQUFFLEtBQUssWUFBWSxDQUFDLEVBQUU7WUFDcEMsV0FBVyxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsSUFBSTtZQUNwQyxXQUFXLENBQUMsRUFBRSxLQUFLLFVBQVUsQ0FBQyxFQUFFLEVBQ2hDOztZQUVBLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1NBQ2hFO2FBQU07O1lBRUwsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7U0FDdEU7UUFFRCxPQUFPLElBQUksQ0FBQztLQUNiOzs7TUMvRFUsZ0JBQWdCO0lBQzNCLFlBQ1UsTUFBZ0IsRUFDaEIsUUFBeUIsRUFDekIsR0FBZSxFQUNmLFFBQXlCLEVBQ3pCLGdCQUF5QztRQUp6QyxXQUFNLEdBQU4sTUFBTSxDQUFVO1FBQ2hCLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBQ3pCLFFBQUcsR0FBSCxHQUFHLENBQVk7UUFDZixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUN6QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQXlCO1FBb0IzQyxVQUFLLEdBQUc7WUFDZCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztTQUMzRCxDQUFDO1FBRU0sUUFBRyxHQUFHLENBQUMsTUFBZ0I7WUFDN0IsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQzNDLENBQUMsSUFBSSxLQUFLLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQ3RDLE1BQU0sQ0FDUCxDQUFDO1NBQ0gsQ0FBQztLQTVCRTtJQUVFLElBQUk7O1lBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FDakNBLFdBQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ1I7b0JBQ0UsR0FBRyxFQUFFLEtBQUs7b0JBQ1YsR0FBRyxFQUFFLEtBQUs7b0JBQ1YsR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7d0JBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzt3QkFDakIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO3FCQUNkLENBQUM7aUJBQ0g7YUFDRixDQUFDLENBQ0gsQ0FBQztTQUNIO0tBQUE7SUFFSyxNQUFNOytEQUFLO0tBQUE7OztNQ2hDTiw0QkFBNEI7SUFJdkMsWUFBb0IsSUFBVTtRQUFWLFNBQUksR0FBSixJQUFJLENBQU07UUFIdEIsb0JBQWUsR0FBRyxLQUFLLENBQUM7UUFDeEIsWUFBTyxHQUFHLEtBQUssQ0FBQztLQUVVO0lBRWxDLHFCQUFxQjtRQUNuQixPQUFPLElBQUksQ0FBQyxlQUFlLENBQUM7S0FDN0I7SUFFRCxZQUFZO1FBQ1YsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0tBQ3JCO0lBRUQsT0FBTztRQUNMLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFdEIsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRTtZQUMzQixPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUM1QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUVwQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDdkMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ2xDLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRW5FLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztLQUN4RTs7O01DckJVLG1DQUFtQztJQUM5QyxZQUNVLE1BQWdCLEVBQ2hCLFFBQXlCLEVBQ3pCLEdBQWUsRUFDZixRQUF5QixFQUN6QixnQkFBeUM7UUFKekMsV0FBTSxHQUFOLE1BQU0sQ0FBVTtRQUNoQixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUN6QixRQUFHLEdBQUgsR0FBRyxDQUFZO1FBQ2YsYUFBUSxHQUFSLFFBQVEsQ0FBaUI7UUFDekIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUF5QjtRQW1CM0MsVUFBSyxHQUFHO1lBQ2QsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUM7U0FDN0QsQ0FBQztRQUVNLFFBQUcsR0FBRyxDQUFDLE1BQWdCO1lBQzdCLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUMzQyxDQUFDLElBQUksS0FBSyxJQUFJLDRCQUE0QixDQUFDLElBQUksQ0FBQyxFQUNoRCxNQUFNLENBQ1AsQ0FBQztTQUNILENBQUM7S0EzQkU7SUFFRSxJQUFJOztZQUNSLElBQUksQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQ2pDQSxXQUFNLENBQUMsRUFBRSxDQUFDO2dCQUNSO29CQUNFLEdBQUcsRUFBRSxlQUFlO29CQUNwQixHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQzt3QkFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO3dCQUNqQixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7cUJBQ2QsQ0FBQztpQkFDSDthQUNGLENBQUMsQ0FDSCxDQUFDO1NBQ0g7S0FBQTtJQUVLLE1BQU07K0RBQUs7S0FBQTs7O0FDOUJuQixNQUFNLGdDQUFpQyxTQUFRSSx5QkFBZ0I7SUFDN0QsWUFBWSxHQUFRLEVBQUUsTUFBZ0IsRUFBVSxRQUF5QjtRQUN2RSxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRDJCLGFBQVEsR0FBUixRQUFRLENBQWlCO0tBRXhFO0lBRUQsT0FBTztRQUNMLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFN0IsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRXBCLElBQUlDLGdCQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxpQ0FBaUMsQ0FBQzthQUMxQyxPQUFPLENBQ04sOElBQThJLENBQy9JO2FBQ0EsU0FBUyxDQUFDLENBQUMsTUFBTTtZQUNoQixNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQU8sS0FBSztnQkFDN0QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO2dCQUNqQyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7YUFDNUIsQ0FBQSxDQUFDLENBQUM7U0FDSixDQUFDLENBQUM7UUFFTCxJQUFJQSxnQkFBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixPQUFPLENBQUMsaUNBQWlDLENBQUM7YUFDMUMsT0FBTyxDQUFDLG1EQUFtRCxDQUFDO2FBQzVELFNBQVMsQ0FBQyxDQUFDLE1BQU07WUFDaEIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUs7Z0JBQzlELElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztnQkFDbEMsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO2FBQzVCLENBQUEsQ0FBQyxDQUFDO1NBQ0osQ0FBQyxDQUFDO1FBRUwsSUFBSUEsZ0JBQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLHVCQUF1QixDQUFDO2FBQ2hDLE9BQU8sQ0FBQyx3REFBd0QsQ0FBQzthQUNqRSxTQUFTLENBQUMsQ0FBQyxNQUFNO1lBQ2hCLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBTyxLQUFLO2dCQUM5RCxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7Z0JBQ2xDLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQzthQUM1QixDQUFBLENBQUMsQ0FBQztTQUNKLENBQUMsQ0FBQztRQUVMLElBQUlBLGdCQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQzthQUM5QixPQUFPLENBQUMsNERBQTRELENBQUM7YUFDckUsU0FBUyxDQUFDLENBQUMsTUFBTTtZQUNoQixNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQU8sS0FBSztnQkFDNUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO2dCQUNoQyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7YUFDNUIsQ0FBQSxDQUFDLENBQUM7U0FDSixDQUFDLENBQUM7UUFFTCxJQUFJQSxnQkFBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixPQUFPLENBQUMsc0NBQXNDLENBQUM7YUFDL0MsT0FBTyxDQUNOLDBHQUEwRyxDQUMzRzthQUNBLFNBQVMsQ0FBQyxDQUFDLE1BQU07WUFDaEIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUs7Z0JBQzVELElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztnQkFDaEMsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO2FBQzVCLENBQUEsQ0FBQyxDQUFDO1NBQ0osQ0FBQyxDQUFDO1FBRUwsSUFBSUEsZ0JBQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLFlBQVksQ0FBQzthQUNyQixPQUFPLENBQ04sNkVBQTZFLENBQzlFO2FBQ0EsU0FBUyxDQUFDLENBQUMsTUFBTTtZQUNoQixNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQU8sS0FBSztnQkFDeEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO2dCQUM1QixNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7YUFDNUIsQ0FBQSxDQUFDLENBQUM7U0FDSixDQUFDLENBQUM7S0FDTjtDQUNGO01BRVksa0JBQWtCO0lBQzdCLFlBQW9CLE1BQWdCLEVBQVUsUUFBeUI7UUFBbkQsV0FBTSxHQUFOLE1BQU0sQ0FBVTtRQUFVLGFBQVEsR0FBUixRQUFRLENBQWlCO0tBQUk7SUFFckUsSUFBSTs7WUFDUixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FDdkIsSUFBSSxnQ0FBZ0MsQ0FDbEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQ2YsSUFBSSxDQUFDLE1BQU0sRUFDWCxJQUFJLENBQUMsUUFBUSxDQUNkLENBQ0YsQ0FBQztTQUNIO0tBQUE7SUFFSyxNQUFNOytEQUFLO0tBQUE7OztNQzdGTix1QkFBdUI7SUFJbEMsWUFBb0IsSUFBVSxFQUFVLGtCQUEwQjtRQUE5QyxTQUFJLEdBQUosSUFBSSxDQUFNO1FBQVUsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFRO1FBSDFELG9CQUFlLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLFlBQU8sR0FBRyxLQUFLLENBQUM7S0FFOEM7SUFFdEUscUJBQXFCO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQztLQUM3QjtJQUVELFlBQVk7UUFDVixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7S0FDckI7SUFFRCxPQUFPO1FBQ0wsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQztRQUV0QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFO1lBQzNCLE9BQU87U0FDUjtRQUVELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNoQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUN2QyxNQUFNLGVBQWUsR0FBRyxJQUFJO2FBQ3pCLFlBQVksRUFBRTthQUNkLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFNUMsSUFBSSxNQUFNLENBQUMsRUFBRSxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFO1lBQ3ZDLE9BQU87U0FDUjtRQUVELElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBQzVCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1FBRXBCLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUU7WUFDMUIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRTtrQkFDekIsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEdBQUcsSUFBSSxDQUFDLGtCQUFrQjtrQkFDbkQsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFFL0MsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUM3QjtRQUVELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSTtZQUNqRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ2xDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN2RCxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2FBQ3JEO2lCQUFNO2dCQUNMLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ3JCO1lBRUQsT0FBTyxHQUFHLENBQUM7U0FDWixFQUFFLEVBQWMsQ0FBQyxDQUFDO1FBRW5CLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFekIsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUNqQixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDO1lBQ3JCLEVBQUUsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsTUFBTTtTQUNqQyxDQUFDLENBQUM7S0FDSjs7O01DbERVLGlDQUFpQztJQUM1QyxZQUNVLE1BQWdCLEVBQ2hCLFFBQXlCLEVBQ3pCLFFBQXlCLEVBQ3pCLEdBQWUsRUFDZixnQkFBeUM7UUFKekMsV0FBTSxHQUFOLE1BQU0sQ0FBVTtRQUNoQixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUN6QixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUN6QixRQUFHLEdBQUgsR0FBRyxDQUFZO1FBQ2YscUJBQWdCLEdBQWhCLGdCQUFnQixDQUF5QjtRQW1CM0MsVUFBSyxHQUFHO1lBQ2QsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUM7U0FDN0QsQ0FBQztRQUVNLFFBQUcsR0FBRyxDQUFDLE1BQWdCO1lBQzdCLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUMzQyxDQUFDLElBQUksS0FDSCxJQUFJLHVCQUF1QixDQUN6QixJQUFJLEVBQ0osSUFBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxDQUN0QyxFQUNILE1BQU0sQ0FDUCxDQUFDO1NBQ0gsQ0FBQztLQS9CRTtJQUVFLElBQUk7O1lBQ1IsSUFBSSxDQUFDLE1BQU0sQ0FBQyx1QkFBdUIsQ0FDakNMLFdBQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ1I7b0JBQ0UsR0FBRyxFQUFFLFNBQVM7b0JBQ2QsR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7d0JBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzt3QkFDakIsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHO3FCQUNkLENBQUM7aUJBQ0g7YUFDRixDQUFDLENBQ0gsQ0FBQztTQUNIO0tBQUE7SUFFSyxNQUFNOytEQUFLO0tBQUE7OztNQ0dOLG1CQUFtQjtJQUM5QixZQUFZLENBQUMsTUFBMEIsRUFBRSxJQUFzQjtRQUM3RCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbEMsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRS9CLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDbkMsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUVqQyxLQUFLLElBQUksQ0FBQyxHQUFHLFFBQVEsRUFBRSxDQUFDLElBQUksTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ3ZDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDbEI7UUFFRCxNQUFNLFVBQVUscUJBQVEsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUM7UUFDdkMsTUFBTSxRQUFRLHFCQUFRLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDO1FBQ3JDLElBQUksTUFBTSxHQUFHLFNBQVMsQ0FBQztRQUN2QixJQUFJLE1BQU0sR0FBRyxTQUFTLENBQUM7O1FBR3ZCLE9BQU8sSUFBSSxFQUFFO1lBQ1gsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxJQUFJLE9BQU8sR0FBRyxDQUFDLEVBQUU7Z0JBQ2YsTUFBTTthQUNQO1lBQ0QsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoRCxJQUFJLE9BQU8sS0FBSyxPQUFPLEVBQUU7Z0JBQ3ZCLE1BQU07YUFDUDtZQUNELFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNsQixNQUFNLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ3ZDOztRQUVELE9BQU8sSUFBSSxFQUFFO1lBQ1gsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QyxJQUFJLE9BQU8sR0FBRyxDQUFDLEVBQUU7Z0JBQ2YsTUFBTTthQUNQO1lBQ0QsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0QyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzlDLElBQUksT0FBTyxLQUFLLE9BQU8sRUFBRTtnQkFDdkIsTUFBTTthQUNQO1lBQ0QsTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFDLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUUxQyxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzFDLFFBQVEsQ0FBQyxFQUFFO2dCQUNULFFBQVEsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sR0FBRyxRQUFRLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7WUFDL0QsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1NBQ2pCO1FBRUQsSUFBSSxNQUFNLEtBQUssTUFBTSxFQUFFO1lBQ3JCLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztTQUNuRDtRQUVELE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7O1FBRzNDLEtBQUssSUFBSSxDQUFDLEdBQUcsUUFBUSxFQUFFLENBQUMsSUFBSSxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDdkMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRTtnQkFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNoQjtTQUNGO0tBQ0Y7OztNQ3pHVSxVQUFVO0lBQXZCO1FBQ1UsZ0JBQVcsR0FBRyxLQUFLLENBQUM7UUFnQnBCLHVCQUFrQixHQUFHO1lBQzNCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1NBQ3pCLENBQUM7UUFFTSxxQkFBZ0IsR0FBRztZQUN6QixJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztTQUMxQixDQUFDO0tBQ0g7SUFyQk8sSUFBSTs7WUFDUixRQUFRLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDdkUsUUFBUSxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1NBQ3BFO0tBQUE7SUFFSyxNQUFNOztZQUNWLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUN0RSxRQUFRLENBQUMsbUJBQW1CLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7U0FDM0U7S0FBQTtJQUVELFdBQVc7UUFDVCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7S0FDekI7OztNQ2JVLGFBQWE7SUFDeEIsWUFBb0IsUUFBeUI7UUFBekIsYUFBUSxHQUFSLFFBQVEsQ0FBaUI7S0FBSTs7SUFHakQsR0FBRyxDQUFDLE1BQWMsRUFBRSxHQUFHLElBQVc7UUFDaEMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFO1lBQ3hCLE9BQU87U0FDUjtRQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7S0FDL0I7SUFFRCxJQUFJLENBQUMsTUFBYzs7UUFFakIsT0FBTyxDQUFDLEdBQUcsSUFBVyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7S0FDdEQ7OztBQ0FILFNBQVMsVUFBVSxDQUFDLElBQWdCLEVBQUUsSUFBWSxFQUFFLEVBQVU7SUFDNUQsSUFBSSxLQUFLLEdBQXdDLElBQUksQ0FBQztJQUN0RE0saUJBQVksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUNsRCxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxJQUFJLEdBQUcsSUFBSTtZQUFFLEtBQUssR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQztLQUN2RCxDQUFDLENBQUM7SUFDSCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUM7TUFFWSxRQUFRO0lBQ25CLFlBQW9CLENBQVM7UUFBVCxNQUFDLEdBQUQsQ0FBQyxDQUFRO0tBQUk7SUFFakMsU0FBUztRQUNQLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQztLQUMzQjtJQUVELE9BQU8sQ0FBQyxDQUFTO1FBQ2YsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUMxQjtJQUVELFFBQVE7UUFDTixPQUFPLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7S0FDMUI7SUFFRCxjQUFjO1FBQ1osT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDO0tBQ2hDO0lBRUQsUUFBUSxDQUFDLElBQXNCLEVBQUUsRUFBb0I7UUFDbkQsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7S0FDbEM7SUFFRCxZQUFZLENBQ1YsV0FBbUIsRUFDbkIsSUFBc0IsRUFDdEIsRUFBb0I7UUFFcEIsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxXQUFXLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0tBQ25EO0lBRUQsYUFBYSxDQUFDLFVBQStCO1FBQzNDLElBQUksQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0tBQ2xDO0lBRUQsUUFBUSxDQUFDLElBQVk7UUFDbkIsSUFBSSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDdkI7SUFFRCxRQUFRO1FBQ04sT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO0tBQzFCO0lBRUQsSUFBSSxDQUFDLENBQVM7UUFDWixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDbEMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVELE1BQU0sS0FBSyxHQUFHQyxpQkFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFakQsSUFBSSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxFQUFFLEVBQUU7WUFDckMsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDQyxlQUFVLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ3BEO0lBRUQsTUFBTSxDQUFDLENBQVM7UUFDZCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDbEMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVELE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFN0MsSUFBSSxDQUFDLEtBQUssRUFBRTtZQUNWLE9BQU87U0FDUjtRQUVELElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQ0MsaUJBQVksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7S0FDdEQ7SUFFRCxRQUFRLENBQUMsQ0FBUztRQUNoQixPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUM7S0FDL0M7SUFFRCxxQkFBcUIsQ0FBQyxDQUFTO1FBQzdCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNsQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUQsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUU3QyxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ1YsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUVELE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0tBQ3JEO0lBRUQsZ0JBQWdCLENBQUMsQ0FBZ0I7UUFDL0JDLHFCQUFnQixDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7S0FDckQ7SUFFTyxhQUFhOztRQUVuQixPQUFRLElBQUksQ0FBQyxDQUFTLENBQUMsRUFBRSxDQUFDO0tBQzNCOzs7TUNuR1UsZUFBZTtJQUMxQixZQUFvQixHQUFRO1FBQVIsUUFBRyxHQUFILEdBQUcsQ0FBSztLQUFJO0lBRWhDLHFCQUFxQjtRQUNuQixNQUFNLE1BQU0sbUJBQ1YsWUFBWSxFQUFFLElBQUksSUFFZCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQWEsQ0FBQyxNQUFNLENBQ2xDLENBQUM7UUFFRixPQUFPLE1BQU0sQ0FBQyxZQUFZLENBQUM7S0FDNUI7SUFFRCxxQkFBcUI7UUFDbkIsTUFBTSxNQUFNLG1CQUNWLFFBQVEsRUFBRSxFQUFFLElBRVIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFhLENBQUMsTUFBTSxDQUNsQyxDQUFDO1FBRUYsT0FBTyxNQUFNLENBQUMsUUFBUSxLQUFLLEVBQUUsQ0FBQztLQUMvQjtJQUVELHVCQUF1QjtRQUNyQix1QkFDRSxNQUFNLEVBQUUsSUFBSSxFQUNaLE9BQU8sRUFBRSxDQUFDLElBRU4sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFhLENBQUMsTUFBTSxFQUNqQztLQUNIO0lBRUQsdUJBQXVCO1FBQ3JCLHVCQUNFLFVBQVUsRUFBRSxLQUFLLElBRWIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFhLENBQUMsTUFBTSxFQUNqQztLQUNIO0lBRUQscUJBQXFCO1FBQ25CLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFFM0QsT0FBTyxNQUFNLEdBQUcsSUFBSSxHQUFHLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7S0FDOUQ7SUFFRCxrQkFBa0IsQ0FBQyxLQUFrQjtRQUNuQyxPQUFPLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUNDLHdCQUFlLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztLQUMxRDtJQUVELHVCQUF1QixDQUFDLE1BTXZCO1FBQ0MsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssS0FBSyxNQUFNLElBQUksQ0FBQyxDQUFDO1FBQzNDLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxNQUFNLENBQUM7UUFFdkIsT0FBTyxDQUFDLElBQWdCO1lBQ3RCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFbkQsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDbEIsT0FBTyxLQUFLLENBQUM7YUFDZDtZQUVELE1BQU0sRUFBRSxZQUFZLEVBQUUscUJBQXFCLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFNUQsT0FBTyxZQUFZLElBQUkscUJBQXFCLENBQUM7U0FDOUMsQ0FBQztLQUNIO0lBRUQsb0JBQW9CLENBQUMsRUFBaUM7UUFDcEQsT0FBTyxDQUFDLE1BQWM7WUFDcEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEMsTUFBTSxxQkFBcUIsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFM0MsSUFDRSxDQUFDLHFCQUFxQjtnQkFDdEIsTUFBTSxDQUFDLEtBQUs7Z0JBQ1osTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUMvQjtnQkFDQSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEtBQXNCLENBQUMsQ0FBQzthQUMxRDtTQUNGLENBQUM7S0FDSDs7O0FDbkdILE1BQU0sVUFBVSxHQUFHLG1CQUFtQixDQUFDO0FBRXZDLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxVQUFVLFFBQVEsQ0FBQyxDQUFDO0FBQ25FLE1BQU0sVUFBVSxHQUFHLElBQUksTUFBTSxDQUFDLFVBQVUsVUFBVSxRQUFRLENBQUMsQ0FBQztBQUM1RCxNQUFNLGtCQUFrQixHQUFHLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ2pELE1BQU0sZUFBZSxHQUFHLElBQUksTUFBTSxDQUFDLGFBQWEsVUFBVSxjQUFjLENBQUMsQ0FBQztNQTZCN0QsYUFBYTtJQUN4QixZQUFvQixNQUFxQjtRQUFyQixXQUFNLEdBQU4sTUFBTSxDQUFlO0tBQUk7SUFFN0MsS0FBSyxDQUFDLE1BQWMsRUFBRSxNQUFNLEdBQUcsTUFBTSxDQUFDLFNBQVMsRUFBRTtRQUMvQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN4QyxNQUFNLEtBQUssR0FBRyxDQUFDLEdBQVc7WUFDeEIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ1AsT0FBTyxJQUFJLENBQUM7U0FDYixDQUFDO1FBRUYsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFekMsSUFBSSxjQUFjLEdBQWtCLElBQUksQ0FBQztRQUV6QyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDekIsY0FBYyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUM7U0FDOUI7YUFBTSxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUN0QyxJQUFJLG9CQUFvQixHQUFHLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQzNDLE9BQU8sb0JBQW9CLElBQUksQ0FBQyxFQUFFO2dCQUNoQyxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQ2xELElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDekIsY0FBYyxHQUFHLG9CQUFvQixDQUFDO29CQUN0QyxNQUFNO2lCQUNQO3FCQUFNLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxFQUFFO29CQUN0QyxvQkFBb0IsRUFBRSxDQUFDO2lCQUN4QjtxQkFBTTtvQkFDTCxNQUFNO2lCQUNQO2FBQ0Y7U0FDRjtRQUVELElBQUksY0FBYyxJQUFJLElBQUksRUFBRTtZQUMxQixPQUFPLElBQUksQ0FBQztTQUNiO1FBRUQsSUFBSSxhQUFhLEdBQWtCLElBQUksQ0FBQztRQUN4QyxJQUFJLG1CQUFtQixHQUFHLGNBQWMsQ0FBQztRQUN6QyxPQUFPLG1CQUFtQixJQUFJLENBQUMsRUFBRTtZQUMvQixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQzFELE1BQU07YUFDUDtZQUNELElBQUksSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUN0QyxhQUFhLEdBQUcsbUJBQW1CLENBQUM7YUFDckM7WUFDRCxtQkFBbUIsRUFBRSxDQUFDO1NBQ3ZCO1FBRUQsSUFBSSxhQUFhLEtBQUssSUFBSSxFQUFFO1lBQzFCLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFFRCxJQUFJLFdBQVcsR0FBRyxjQUFjLENBQUM7UUFDakMsSUFBSSxpQkFBaUIsR0FBRyxjQUFjLENBQUM7UUFDdkMsT0FBTyxpQkFBaUIsSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDN0MsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUMxRCxNQUFNO2FBQ1A7WUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDM0IsV0FBVyxHQUFHLGlCQUFpQixDQUFDO2FBQ2pDO1lBQ0QsaUJBQWlCLEVBQUUsQ0FBQztTQUNyQjtRQUVELElBQUksYUFBYSxHQUFHLE1BQU0sQ0FBQyxJQUFJLElBQUksV0FBVyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUU7WUFDNUQsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUVELE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxDQUNuQixFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUM5QixFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQzdELE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU07WUFDbEMsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRTtZQUNoRCxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFO1NBQzNDLENBQUMsQ0FBQyxDQUNKLENBQUM7UUFFRixJQUFJLGFBQWEsR0FBa0IsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3RELElBQUksV0FBVyxHQUF5QixJQUFJLENBQUM7UUFDN0MsSUFBSSxhQUFhLEdBQUcsRUFBRSxDQUFDO1FBRXZCLEtBQUssSUFBSSxDQUFDLEdBQUcsYUFBYSxFQUFFLENBQUMsSUFBSSxXQUFXLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDakQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvQixNQUFNLE9BQU8sR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRTNDLElBQUksT0FBTyxFQUFFO2dCQUNYLE1BQU0sR0FBRyxNQUFNLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxHQUFHLE9BQU8sQ0FBQztnQkFFOUQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEUsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBQ25ELE1BQU0sa0JBQWtCLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBRWpFLElBQUksV0FBVyxLQUFLLGtCQUFrQixFQUFFO29CQUN0QyxNQUFNLFFBQVEsR0FBRyxrQkFBa0I7eUJBQ2hDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDO3lCQUNsQixPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUN2QixNQUFNLEdBQUcsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUUvRCxPQUFPLEtBQUssQ0FDViwwQ0FBMEMsUUFBUSxXQUFXLEdBQUcsR0FBRyxDQUNwRSxDQUFDO2lCQUNIO2dCQUVELElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxhQUFhLENBQUMsTUFBTSxFQUFFO29CQUN4QyxhQUFhLEdBQUcsV0FBVyxDQUFDO29CQUM1QixhQUFhLEdBQUcsTUFBTSxDQUFDO2lCQUN4QjtxQkFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsYUFBYSxDQUFDLE1BQU0sRUFBRTtvQkFDL0MsT0FDRSxhQUFhLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU07d0JBQzFELGFBQWEsQ0FBQyxTQUFTLEVBQUUsRUFDekI7d0JBQ0EsYUFBYSxHQUFHLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztxQkFDM0M7b0JBQ0QsYUFBYSxHQUFHLE1BQU0sQ0FBQztpQkFDeEI7Z0JBRUQsTUFBTSxNQUFNLEdBQ1YsTUFBTSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUUvRCxXQUFXLEdBQUcsSUFBSSxJQUFJLENBQ3BCLElBQUksRUFDSixNQUFNLEVBQ04sTUFBTSxFQUNOLGdCQUFnQixFQUNoQixPQUFPLEVBQ1AsTUFBTSxDQUNQLENBQUM7Z0JBQ0YsYUFBYSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQzthQUN4QztpQkFBTSxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDdEMsSUFBSSxDQUFDLFdBQVcsRUFBRTtvQkFDaEIsT0FBTyxLQUFLLENBQ1YsMERBQTBELENBQzNELENBQUM7aUJBQ0g7Z0JBRUQsTUFBTSxhQUFhLEdBQUcsV0FBVyxDQUFDLGNBQWMsRUFBRSxJQUFJLGFBQWEsQ0FBQztnQkFFcEUsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRTtvQkFDckMsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztvQkFDdEUsTUFBTSxHQUFHLEdBQUcsSUFBSTt5QkFDYixLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO3lCQUNuQixPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQzt5QkFDbEIsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztvQkFFdkIsT0FBTyxLQUFLLENBQ1YsMENBQTBDLFFBQVEsV0FBVyxHQUFHLEdBQUcsQ0FDcEUsQ0FBQztpQkFDSDtnQkFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsRUFBRSxFQUFFO29CQUNqQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUV0QyxJQUFJLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksYUFBYSxDQUFDLE1BQU0sRUFBRTt3QkFDekQsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFOzRCQUN0QixTQUFTO3lCQUNWO3dCQUVELE9BQU8sS0FBSyxDQUNWLDJEQUEyRCxDQUM1RCxDQUFDO3FCQUNIO29CQUVELFdBQVcsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQ3hDO2dCQUVELFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsY0FBYyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzthQUN0RTtpQkFBTTtnQkFDTCxPQUFPLEtBQUssQ0FDViwwREFBMEQsSUFBSSxHQUFHLENBQ2xFLENBQUM7YUFDSDtTQUNGO1FBRUQsT0FBTyxJQUFJLENBQUM7S0FDYjtJQUVPLFdBQVcsQ0FBQyxJQUFZO1FBQzlCLE9BQU8sSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUM7S0FDMUI7SUFFTyxnQkFBZ0IsQ0FBQyxJQUFZO1FBQ25DLE9BQU8sa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3RDO0lBRU8sVUFBVSxDQUFDLElBQVk7UUFDN0IsT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQzlCO0lBRU8sdUJBQXVCLENBQUMsSUFBWTtRQUMxQyxPQUFPLHVCQUF1QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUMzQzs7O01DN05VLHVCQUF1QjtJQUNsQyxZQUNVLE1BQXFCLEVBQ3JCLFlBQWlDO1FBRGpDLFdBQU0sR0FBTixNQUFNLENBQWU7UUFDckIsaUJBQVksR0FBWixZQUFZLENBQXFCO0tBQ3ZDO0lBRUosYUFBYSxDQUFDLElBQVUsRUFBRSxFQUFhLEVBQUUsTUFBZ0I7UUFDdkQsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRWIsSUFBSSxFQUFFLENBQUMsWUFBWSxFQUFFLEVBQUU7WUFDckIsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQzlDO1FBRUQsT0FBTztZQUNMLFlBQVksRUFBRSxFQUFFLENBQUMsWUFBWSxFQUFFO1lBQy9CLHFCQUFxQixFQUFFLEVBQUUsQ0FBQyxxQkFBcUIsRUFBRTtTQUNsRCxDQUFDO0tBQ0g7SUFFRCxnQkFBZ0IsQ0FDZCxFQUE2QixFQUM3QixNQUFnQixFQUNoQixNQUFNLEdBQUcsTUFBTSxDQUFDLFNBQVMsRUFBRTtRQUUzQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFL0MsSUFBSSxDQUFDLElBQUksRUFBRTtZQUNULE9BQU8sRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxDQUFDO1NBQzlEO1FBRUQsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXBCLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0tBQzdDOzs7QUMvQkgsTUFBTSxnQkFBZ0IsR0FBbUM7SUFDdkQsVUFBVSxFQUFFLEtBQUs7SUFDakIsS0FBSyxFQUFFLEtBQUs7SUFDWixXQUFXLEVBQUUsSUFBSTtJQUNqQixXQUFXLEVBQUUsSUFBSTtJQUNqQixTQUFTLEVBQUUsSUFBSTtJQUNmLFNBQVMsRUFBRSxJQUFJO0NBQ2hCLENBQUM7TUFXVyxlQUFlO0lBSzFCLFlBQVksT0FBZ0I7UUFDMUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0tBQzNCO0lBRUQsSUFBSSxVQUFVO1FBQ1osT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQztLQUMvQjtJQUNELElBQUksVUFBVSxDQUFDLEtBQWM7UUFDM0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDL0I7SUFFRCxJQUFJLEtBQUs7UUFDUCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO0tBQzFCO0lBQ0QsSUFBSSxLQUFLLENBQUMsS0FBYztRQUN0QixJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztLQUMxQjtJQUVELElBQUksV0FBVztRQUNiLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUM7S0FDaEM7SUFDRCxJQUFJLFdBQVcsQ0FBQyxLQUFjO1FBQzVCLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO0tBQ2hDO0lBRUQsSUFBSSxXQUFXO1FBQ2IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQztLQUNoQztJQUNELElBQUksV0FBVyxDQUFDLEtBQWM7UUFDNUIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDaEM7SUFFRCxJQUFJLFNBQVM7UUFDWCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO0tBQzlCO0lBQ0QsSUFBSSxTQUFTLENBQUMsS0FBYztRQUMxQixJQUFJLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztLQUM5QjtJQUVELElBQUksU0FBUztRQUNYLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7S0FDOUI7SUFDRCxJQUFJLFNBQVMsQ0FBQyxLQUFjO1FBQzFCLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0tBQzlCO0lBRUQsUUFBUSxDQUFjLEdBQU0sRUFBRSxFQUFlO1FBQzNDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUMzQixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1NBQ25DO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2hDO0lBRUQsY0FBYyxDQUFjLEdBQU0sRUFBRSxFQUFlO1FBQ2pELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXhDLElBQUksUUFBUSxFQUFFO1lBQ1osUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUNyQjtLQUNGO0lBRUQsS0FBSztRQUNILEtBQUssTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEVBQUU7WUFDckQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7U0FDaEI7S0FDRjtJQUVLLElBQUk7O1lBQ1IsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUN6QixFQUFFLEVBQ0YsZ0JBQWdCLEVBQ2hCLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FDOUIsQ0FBQztTQUNIO0tBQUE7SUFFSyxJQUFJOztZQUNSLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQzFDO0tBQUE7SUFFTyxHQUFHLENBQWMsR0FBTSxFQUFFLEtBQVc7UUFDMUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7UUFDekIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFekMsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUNkLE9BQU87U0FDUjtRQUVELEtBQUssTUFBTSxFQUFFLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ25DLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUNYO0tBQ0Y7OztNQ3JHa0Isc0JBQXVCLFNBQVFDLGVBQU07SUFVbEQsTUFBTTs7WUFDVixPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFFekMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLGVBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFOUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLEVBQUU7Z0JBQ3pDLElBQUlULGVBQU0sQ0FDUixrTEFBa0wsRUFDbEwsS0FBSyxDQUNOLENBQUM7Z0JBQ0YsT0FBTzthQUNSO1lBRUQsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMxQyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFM0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFL0MsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDN0MsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDOUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksdUJBQXVCLENBQ2pELElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFDLFlBQVksQ0FDbEIsQ0FBQztZQUVGLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUM1QixNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFdEIsSUFBSSxDQUFDLFFBQVEsR0FBRztnQkFDZCxJQUFJLGtCQUFrQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUMzQyxJQUFJLGtCQUFrQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQztnQkFDcEQsSUFBSSxnQ0FBZ0MsQ0FDbEMsSUFBSSxFQUNKLElBQUksQ0FBQyxRQUFRLEVBQ2IsSUFBSSxDQUFDLEdBQUcsRUFDUixJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxnQkFBZ0IsQ0FDdEI7Z0JBQ0QsSUFBSSwrQkFBK0IsQ0FDakMsSUFBSSxFQUNKLElBQUksQ0FBQyxRQUFRLEVBQ2IsSUFBSSxDQUFDLEdBQUcsRUFDUixJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxnQkFBZ0IsQ0FDdEI7Z0JBQ0QsSUFBSSxnQ0FBZ0MsQ0FDbEMsSUFBSSxFQUNKLElBQUksQ0FBQyxRQUFRLEVBQ2IsSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsZ0JBQWdCLENBQ3RCO2dCQUNELElBQUksdUNBQXVDLENBQ3pDLElBQUksRUFDSixJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsZ0JBQWdCLENBQ3RCO2dCQUNELElBQUksZ0NBQWdDLENBQ2xDLElBQUksRUFDSixJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsZ0JBQWdCLENBQ3RCO2dCQUNELElBQUksbUNBQW1DLENBQ3JDLElBQUksRUFDSixJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsZ0JBQWdCLENBQ3RCO2dCQUNELElBQUksV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxJQUFJLGdCQUFnQixDQUNsQixJQUFJLEVBQ0osSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsR0FBRyxFQUNSLElBQUksQ0FBQyxRQUFRLEVBQ2IsSUFBSSxDQUFDLGdCQUFnQixDQUN0QjtnQkFDRCxJQUFJLGdCQUFnQixDQUNsQixJQUFJLEVBQ0osSUFBSSxDQUFDLEdBQUcsRUFDUixJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxRQUFRLEVBQ2IsSUFBSSxDQUFDLGdCQUFnQixDQUN0QjtnQkFDRCxJQUFJLGlDQUFpQyxDQUNuQyxJQUFJLEVBQ0osSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxDQUFDLGdCQUFnQixDQUN0QjthQUNGLENBQUM7WUFFRixLQUFLLE1BQU0sT0FBTyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7Z0JBQ25DLE1BQU0sT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO2FBQ3RCO1NBQ0Y7S0FBQTtJQUVLLFFBQVE7O1lBQ1osT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1lBRTNDLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUV4QixLQUFLLE1BQU0sT0FBTyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7Z0JBQ25DLE1BQU0sT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO2FBQ3hCO1NBQ0Y7S0FBQTs7Ozs7In0=
