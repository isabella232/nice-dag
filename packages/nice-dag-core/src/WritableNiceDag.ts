import ReadOnlyNiceDag from "./ReadOnlyNiceDag";
import { Grid, Line, IDndProvider } from './dndTypes';
import {
    Bounds, NiceDagInitArgs, NiceDag, HtmlElementBounds,
    Point, Size, IWritableNiceDag, Node,
    IViewModelChangeEvent, ViewModelChangeEventType, ViewModelChangeListener, IViewNode, StyleObjectType, MapNodeToDraggingElementClass
} from './types';
import NiceDagDnd from './dnd';
import * as utils from './utils';
import DndContext from "./dndContext";
// import { resetBoundsWithRatio } from "./utils";
import { EDITOR_BKG_CLS, SVG_BKG_ARROW_ID, SVG_BKG_CLS, SVG_DND_ARROW_ID, SVG_DND_CLS, ZERO_BOUNDS, EDITOR_FOREGROUND_CLS } from "./constants";
import ViewModel from "./ViewModel";

const SVGNS = "http://www.w3.org/2000/svg";

const EDITOR_BACKGROUND_SIZE = {
    width: 100000,
    height: 100000
};

class NiceDagGrid implements Grid {
    private readonly gridSize: number;
    private readonly svg: SVGElement;
    private _xArr: number[];
    private _yArr: number[];
    private xLines: SVGElement[] = [];
    private yLines: SVGElement[] = [];

    constructor(svg: SVGElement, gridSize: number) {
        this.gridSize = gridSize;
        this.svg = svg;
    }

    clear() {
        this.svg.innerHTML = '';
        this.xLines = [];
        this.yLines = [];
    }

    doLayout = (): void => {
        this._xArr = [];
        for (let v = 0; v <= EDITOR_BACKGROUND_SIZE.width;) {
            this._xArr.push(v);
            v += this.gridSize;
        }
        this._yArr = [];
        for (let v = 0; v <= EDITOR_BACKGROUND_SIZE.height;) {
            this._yArr.push(v);
            v += this.gridSize;
        }
    }

    private getLines = (isYAxis = false): Line[] => {
        const points: number[] = isYAxis ? this._yArr : this._xArr;
        const lines = points.map((value) => {
            if (isYAxis) {
                return {
                    x1: 0,
                    y1: value,
                    x2: EDITOR_BACKGROUND_SIZE.width,
                    y2: value,
                };
            }
            return {
                x1: value,
                y1: 0,
                x2: value,
                y2: EDITOR_BACKGROUND_SIZE.height,
            };
        });
        return lines;
    }

    get xArr(): number[] {
        return this._xArr;
    }

    get yArr(): number[] {
        return this._yArr;
    }

    appendLine(line: Line, isYAxis: boolean): void {
        const lineSvg = document.createElementNS(SVGNS, "line");
        lineSvg.setAttribute("class", 'nice-dag-dnd-svg-layer-dash-line');
        lineSvg.setAttribute("x1", `${line.x1}`);
        lineSvg.setAttribute("x2", `${line.x2}`);
        lineSvg.setAttribute("y1", `${line.y1}`);
        lineSvg.setAttribute("y2", `${line.y2}`);
        utils.editHtmlElement(lineSvg).withAttributes({
            'stroke': '#9a9a9a',
            'stroke-width': 1,
            'stroke-dasharray': '2, 4',
        });
        if (!isYAxis) {
            this.xLines.push(lineSvg);
        } else {
            this.yLines.push(lineSvg);
        }
        this.svg.appendChild(lineSvg);
    }

    redraw() {
        const { xArr, yArr } = this;
        this.doLayout();
        const xLines = this.getLines();
        if (this._xArr.length > xArr.length) {
            for (let i = 0; i < this._xArr.length; i++) {
                const line = xLines[i];
                if (i >= xArr.length) {
                    this.appendLine(line, false);
                }
            }
        }
        for (let i = 0; i < xLines.length; i++) {
            const line = xLines[i];
            utils.editHtmlElement(this.xLines[i]).withAttributes({
                'x1': `${line.x1}`,
                'x2': `${line.x2}`,
                'y1': `${line.y1}`,
                'y2': `${line.y2}`,
            });
        }
        const yLines = this.getLines(true);
        if (this._yArr.length > yArr.length) {
            for (let i = 0; i < this._yArr.length; i++) {
                const line = yLines[i];
                if (i >= yArr.length) {
                    this.appendLine(line, true);
                }
            }
        }
        for (let i = 0; i < yLines.length; i++) {
            const line = yLines[i];
            utils.editHtmlElement(this.yLines[i]).withAttributes({
                'x1': `${line.x1}`,
                'x2': `${line.x2}`,
                'y1': `${line.y1}`,
                'y2': `${line.y2}`,
            });
        }
    }

    render = () => {
        this.clear();
        this.doLayout();
        const xLines = this.getLines();
        xLines.forEach(line => {
            this.appendLine(line, false);
        });
        const yLines = this.getLines(true);
        yLines.forEach(line => {
            this.appendLine(line, true);
        });
    }
}

export default class WritableNiceDag extends ReadOnlyNiceDag implements IDndProvider, ViewModelChangeListener, IWritableNiceDag {

    private _dnd: NiceDagDnd;
    private _editing: boolean;
    private svgGridBkg: SVGElement;
    private svgDndBkg: SVGElement;
    private editorBkgContainer: HTMLElement;
    private editorForeContainer: HTMLElement;
    private _grid: NiceDagGrid;
    private glassStyles: StyleObjectType;
    private _gridVisible: boolean;
    private mapNodeToDraggingElementClass: MapNodeToDraggingElementClass;

    constructor(args: NiceDagInitArgs) {
        super(args);
        this.mapNodeToDraggingElementClass = args.mapNodeToDraggingElementClass;
        this._gridVisible = this._config.gridConfig?.visible;
        this.editorBkgContainer = utils.createElementIfAbsent(this.rootContainer, EDITOR_BKG_CLS)
            .withAbsolutePosition({
                x: 0, y: 0, ...EDITOR_BACKGROUND_SIZE,
            }).htmlElement;
        this.editorForeContainer = utils.createElementIfAbsent(this.mainLayer, EDITOR_FOREGROUND_CLS).withStyle({
            'z-index': 2,
            'display': 'none',
            'overflow': 'hidden'
        }).htmlElement;
        this._dnd = new NiceDagDnd(this.mainLayer, args.glassStyles, this._config.mapEdgeToPoints,
            this.editorForeContainer,
            this.mapNodeToDraggingElementClass);
        this.svgGridBkg = utils.createSvgIfAbsent(this.editorBkgContainer, null, `${this.uid}-${SVG_BKG_ARROW_ID}`)
            .withStyle({
                width: '100%',
                height: '100%'
            })
            .withClassNames(SVG_BKG_CLS).svgElement;
        this.svgDndBkg = utils.createSvgIfAbsent(this.editorForeContainer, null, `${this.uid}-${SVG_DND_ARROW_ID}`)
            .withClassNames(SVG_DND_CLS)
            .withAbsolutePosition(ZERO_BOUNDS).withStyle({
                ...EDITOR_BACKGROUND_SIZE,
                'z-index': 1
            }).svgElement;
    }

    endNodeDragging(): void {
        this.fireMinimapChange();
    }

    endEdgeDragging(): void {
        this.fireMinimapChange();
    }

    get svgDndBackground(): SVGElement {
        return this.svgDndBkg;
    }

    onModelChange(event: IViewModelChangeEvent): void {
        super.onModelChange(event);
        if (event.type === ViewModelChangeEventType.RESIZE) {
            if (this._editing) {
                this.doForegroundLayout();
                this.fireMinimapChange();
            }
        } else if (event.type === ViewModelChangeEventType.REMOVE_NODE) {
            this.fireMinimapChange();
        }
    }

    get grid(): Grid {
        return this._grid;
    }

    get validDndThreshold(): number {
        return 3;
    }

    addJointNode(node: Node, point: Point = {
        x: 0,
        y: 0
    }, targetNodeId: string = 'root'): Node {
        if (targetNodeId === 'root') {
            return this.rootModel.addNode(node, point, true);
        } else {
            const parentNode = this.rootModel.findNodeById(targetNodeId) as IViewNode;
            return parentNode.addChildNode(node, point);
        }
    }

    addNode(node: Node, point: Point = {
        x: 0,
        y: 0
    }, targetNodeId: string = 'root'): Node {
        if (targetNodeId === 'root') {
            return this.rootModel.addNode(node, point);
        } else {
            const parentNode = this.rootModel.findNodeById(targetNodeId) as IViewNode;
            return parentNode.addChildNode(node, point);
        }
    }

    startEditing = (): IWritableNiceDag => {
        this._editing = true;
        this.getAllNodes().forEach(node => node.editing = true);
        this._dnd.setEnabled(true);
        this.showGrid();
        return this;
    }

    stopEditing = (): IWritableNiceDag => {
        this._editing = false;
        this.getAllNodes().forEach(node => node.editing = false);
        this._dnd.setEnabled(false);
        this.hideGrid();
        return this;
    }

    withNodes(nodes: Node[]): NiceDag {
        const _destoried = this.isDestoried;
        super.withNodes(nodes);
        if (_destoried) {
            this._dnd = new NiceDagDnd(this.mainLayer, this.glassStyles, this._config.mapEdgeToPoints,
                this.editorForeContainer, this.mapNodeToDraggingElementClass);
            if (this._editing) {
                this.startEditing();
            } else {
                this.stopEditing();
            }
        }
        return this;
    }

    get editing() {
        return this._editing;
    }

    justifyCenterWhenResizing() {
        if (!this._editing) {
            super.justifyCenterWhenResizing();
        }
    }

    center(size: Size): NiceDag {
        super.center(size);
        if (!this._editing) {
            this.doForegroundLayout();
            this.showGrid();
        }
        return this;
    }

    doForegroundLayout(): void {
        const zoomLayerBounds = this.zoomLayer.getBoundingClientRect();
        const { scale = 1 } = this;
        /**
         * Reset to ratio 1
         */
        const mainLayerBounds = this.mainLayer.getBoundingClientRect();
        const size = {
            width: utils.float2Int(zoomLayerBounds.width / scale),
            height: utils.float2Int(zoomLayerBounds.height / scale)
        };
        if (zoomLayerBounds.width < mainLayerBounds.width) {
            size.width = utils.float2Int(mainLayerBounds.width / scale);
        }
        if (zoomLayerBounds.height < mainLayerBounds.height) {
            size.height = utils.float2Int(mainLayerBounds.height / scale);
        }
        const bounds = {
            x: 0,
            y: 0,
            ...size
        };
        utils.editHtmlElement(this.editorForeContainer).withAbsolutePosition(bounds);
        this.adaptOverflow();
    }

    set gridVisible(visible: boolean) {
        this._gridVisible = visible;
    }

    get gridVisible(): boolean {
        return this._gridVisible;
    }

    showGrid() {
        if (this._gridVisible) {
            this._grid.render();
        }
    }

    hideGrid() {
        this._grid.clear();
    }

    prettify(): IWritableNiceDag {
        const _editing = this.editing;
        this.stopEditing();
        this.rootModel.doLayout(true, true);
        if (_editing) {
            this.startEditing();
        }
        this.justifyCenter(this.parentSize);
        return this;
    }

    adaptOverflow() {
        const mainLayerBounds = utils.htmlElementBounds(this.mainLayer);
        const editorForeContainerSize = {
            width: parseInt(this.editorForeContainer.style.width),
            height: parseInt(this.editorForeContainer.style.height),
        };
        if (mainLayerBounds.width < editorForeContainerSize.width) {
            utils.editHtmlElement(this.mainLayer).withStyle({
                'overflow-x': 'auto'
            });
        } else {
            utils.editHtmlElement(this.mainLayer).withStyle({
                'overflow-x': 'none'
            });
        }
        if (mainLayerBounds.height < editorForeContainerSize.height) {
            utils.editHtmlElement(this.mainLayer).withStyle({
                'overflow-y': 'auto'
            });
        } else {
            utils.editHtmlElement(this.mainLayer).withStyle({
                'overflow-y': 'none'
            });
        }
    }

    /**
     * Resize foreground
     * @param bounds this.context.lastBounds(true, true)
     * @returns void
     */
    resizeForeground(bounds: HtmlElementBounds) {
        /**
         * All in original size
         */
        const backgroundBounds = utils.resetBoundsWithRatio(this.editorForeContainer.getBoundingClientRect(), this.scale);
        const relativeRight = bounds.right;
        const relativeBottom = bounds.bottom;
        let { width, height } = backgroundBounds;
        let shouldResize;
        if (width < relativeRight) {
            width = relativeRight;
            shouldResize = true;
        }
        if (height < relativeBottom) {
            height = relativeBottom;
            shouldResize = true;
        }
        if (shouldResize) {
            const _bounds = {
                x: 0,
                y: 0,
                width, height
            };
            utils.editHtmlElement(this.editorForeContainer).withAbsolutePosition(_bounds);
        }
        this.adaptOverflow();
        return shouldResize;
    }

    drawGrid(): void {
        if (this._gridVisible) {
            this._grid.redraw();
        }
    }

    render(): void {
        super.render();
        this.doForegroundLayout();
        this._grid = new NiceDagGrid(this.svgGridBkg, this.config.gridConfig?.size);
        if (this._editing) {
            this.showGrid();
        }
    }

    startEdgeDragging = (node: IViewNode, e: MouseEvent) => {
        if (this._editing) {
            utils.editHtmlElement(this.editorForeContainer).withStyle({
                'display': 'block'
            });
            const rootBounds: HtmlElementBounds = this._rootContainer.getBoundingClientRect();
            const zoomLayerBounds: HtmlElementBounds = this.zoomLayer.getBoundingClientRect();
            const bounds: HtmlElementBounds = node.ref.getBoundingClientRect();
            this._dnd.withContext(new DndContext({
                rootXy: {
                    x: rootBounds.left,
                    y: rootBounds.y
                },
                zoomLayerXy: {
                    x: zoomLayerBounds.left,
                    y: zoomLayerBounds.y
                },
                mPoint: {
                    x: e.pageX,
                    y: e.pageY
                },
                bounds,
                scale: this._scale,
                provider: this
            })).startEdgeDragging(node, e);
        }
    }

    justifyCenter(size: Size): void {
        if (!this._editing) {
            super.justifyCenter(size);
        } else {
            const viewSize = this.rootModel.size(true);
            let offsetX = 0;
            let offsetY = 0;
            let zoomLayerWidth = viewSize.width;
            let zoomLayerHeight = viewSize.height;
            if (size.width > viewSize.width) {
                offsetX = (size.width - viewSize.width) / 2;
                zoomLayerWidth = utils.float2Int(size.width / this.scale);
            }
            if (size.height > viewSize.height) {
                offsetY = (size.height - viewSize.height) / 2;
                zoomLayerHeight = utils.float2Int(size.height / this.scale);
            }
            if (size.width < viewSize.width) {
                offsetX = 0;
            }
            if (size.height < viewSize.height) {
                offsetY = 0;
            }
            if (offsetX > 0 || offsetY > 0) {
                this.rootModel.setRootOffset({
                    offsetX: utils.float2Int(offsetX / this.scale),
                    offsetY: utils.float2Int(offsetY / this.scale)
                });
                utils.editHtmlElement(this.zoomLayer).withAbsolutePosition({
                    x: 0, y: 0, width: zoomLayerWidth, height: zoomLayerHeight
                });
                this.rootView.justifySize({ width: zoomLayerWidth, height: zoomLayerHeight });
                this.rootModel.setViewSize({
                    width: zoomLayerWidth,
                    height: zoomLayerHeight
                });
            }
        }
    }

    setScale(scale: number): void {
        super.setScale(scale);
        this.editorBkgContainer.style.transform = `scale(${scale})`;
        this.editorBkgContainer.style.transformOrigin = `left top`;
        this.editorForeContainer.style.transformOrigin = `left top`;
        this.editorForeContainer.style.transform = `scale(${scale})`;
        this.doForegroundLayout();
        this.drawGrid();
    }

    justCenterWhenStartEditing(): void {
        if (this.parentSize) {
            const zoomLayerBounds = this.zoomLayer.getBoundingClientRect();
            let offsetX: number = 0;
            let offsetY: number = 0;
            let width: number = 0;
            let height: number = 0;
            let shouldResize;
            if (this.parentSize.width > zoomLayerBounds.width) {
                offsetX = (this.parentSize.width - zoomLayerBounds.width) / 2;
                width = utils.float2Int(this.parentSize.width / this.scale);
                shouldResize = true;
            }
            if (this.parentSize.height > zoomLayerBounds.height) {
                offsetY = (this.parentSize.height - zoomLayerBounds.height) / 2;
                height = utils.float2Int(this.parentSize.height / this.scale);
                shouldResize = true;
            }
            utils.editHtmlElement(this.zoomLayer).withAbsolutePosition({
                x: 0,
                y: 0,
                width,
                height,
            });
            this.rootView.justifySize({ width, height });
            if (shouldResize) {
                (this.rootModel as ViewModel).setRootOffset({
                    offsetX: utils.float2Int(offsetX / this.scale),
                    offsetY: utils.float2Int(offsetY / this.scale)
                });
            }
            this.doForegroundLayout();
        }
    }

    adaptSizeWhenSetScale(scale: number): void {
        if (!this._editing) {
            super.adaptSizeWhenSetScale(scale);
        }
    }

    startNodeDragging = (node: IViewNode, e: MouseEvent) => {
        if (this._editing) {
            utils.editHtmlElement(this.editorForeContainer).withStyle({
                'display': 'block'
            });
            node.editing = true;
            const rootBounds: HtmlElementBounds = this._rootContainer.getBoundingClientRect();
            const bounds: HtmlElementBounds = node.ref.getBoundingClientRect();
            const zoomLayerBounds = this.zoomLayer.getBoundingClientRect();
            this._dnd.withContext(new DndContext({
                rootXy: {
                    x: rootBounds.left,
                    y: rootBounds.y
                },
                zoomLayerXy: {
                    x: zoomLayerBounds.left,
                    y: zoomLayerBounds.y
                },
                mPoint: {
                    x: e.pageX,
                    y: e.pageY
                },
                bounds,
                scale: this._scale,
                provider: this
            })).startNodeDragging(node, e);
        }
    }

    getParentTopLeft(node: IViewNode): Point {
        const bounds = node.ref.parentElement.getBoundingClientRect();
        return {
            x: bounds.left,
            y: bounds.top
        }
    }

    destory(): void {
        super.destory();
        this._dnd.destory();
    }
}