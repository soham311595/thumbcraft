import { useEffect, useRef, forwardRef, useImperativeHandle, useState, useCallback } from "react"
import { Canvas as FabricCanvas, Textbox, Image as FabricImage } from "fabric"

const CANVAS_W = 1280
const CANVAS_H = 720

const Canvas = forwardRef(function Canvas({ initialImageUrl, onSelectionChange, onObjectsChange }, ref) {
  const containerRef = useRef(null)
  const canvasElRef = useRef(null)
  const fabricRef = useRef(null)
  const [ready, setReady] = useState(false)

  useImperativeHandle(ref, () => ({
    exportPNG() {
      const c = fabricRef.current
      if (!c) return ""
      const zoom = c.getZoom()
      return c.toDataURL({ format: "png", multiplier: 1 / zoom })
    },
    addText(opts = {}) {
      const c = fabricRef.current
      if (!c) return
      const t = new Textbox("Edit this text", {
        left: 100,
        top: 80,
        width: 600,
        fontSize: 80,
        fontFamily: "Impact",
        fill: "#FFFFFF",
        stroke: "#000000",
        strokeWidth: 3,
        name: `text_${Date.now()}`,
        ...opts,
      })
      c.add(t)
      c.setActiveObject(t)
      c.renderAll()
      emitChange()
    },
    async addImage(url) {
      const c = fabricRef.current
      if (!c) return
      try {
        const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" })
        img.set({
          left: 200,
          top: 200,
          scaleX: 0.5,
          scaleY: 0.5,
          name: `img_${Date.now()}`,
        })
        c.add(img)
        c.setActiveObject(img)
        c.renderAll()
        emitChange()
      } catch (e) {
        console.error("Failed to load image", e)
      }
    },
    removeSelected() {
      const c = fabricRef.current
      if (!c) return
      const active = c.getActiveObject()
      if (active) {
        c.remove(active)
        c.discardActiveObject()
        c.renderAll()
        emitChange()
      }
    },
    moveLayerUp() {
      const c = fabricRef.current
      if (!c) return
      const active = c.getActiveObject()
      if (active) {
        c.bringForward(active)
        c.renderAll()
        emitChange()
      }
    },
    moveLayerDown() {
      const c = fabricRef.current
      if (!c) return
      const active = c.getActiveObject()
      if (active) {
        c.sendBackwards(active)
        c.renderAll()
        emitChange()
      }
    },
    getObjects() {
      const c = fabricRef.current
      if (!c) return []
      return c.getObjects().map((obj, i) => ({
        index: i,
        name: obj.name || obj.type,
        type: obj.type,
        selected: obj === c.getActiveObject(),
        visible: obj.visible !== false,
      }))
    },
    getActiveObject() {
      return fabricRef.current?.getActiveObject() || null
    },
    updateObjectProps(props) {
      const c = fabricRef.current
      const active = c?.getActiveObject()
      if (!active) return
      active.set(props)
      c.renderAll()
      emitChange()
    },
    toggleVisibility(index) {
      const c = fabricRef.current
      if (!c) return
      const objs = c.getObjects()
      const obj = objs[index]
      if (obj) {
        obj.set({ visible: !obj.visible })
        c.renderAll()
        emitChange()
      }
    },
    selectObject(index) {
      const c = fabricRef.current
      if (!c) return
      const objs = c.getObjects()
      const obj = objs[index]
      if (obj) {
        c.setActiveObject(obj)
        c.renderAll()
      }
    },
    async swapBackground(url) {
      const c = fabricRef.current
      if (!c) return
      try {
        const bg = c.getObjects().find((o) => o.name === "background")
        if (bg) c.remove(bg)
        const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" })
        img.set({
          left: 0,
          top: 0,
          scaleX: CANVAS_W / (img.width || CANVAS_W),
          scaleY: CANVAS_H / (img.height || CANVAS_H),
          selectable: false,
          evented: false,
          name: "background",
        })
        c.add(img)
        c.sendToBack(img)
        c.renderAll()
        emitChange()
      } catch (e) {
        console.error("Failed to swap background", e)
      }
    },
  }))

  function emitChange() {
    const c = fabricRef.current
    if (!c) return
    onObjectsChange?.(c.getObjects().map((obj, i) => ({
      index: i,
      name: obj.name || obj.type,
      type: obj.type,
      selected: obj === c.getActiveObject(),
      visible: obj.visible !== false,
    })))
  }

  const handleSelection = useCallback(() => {
    const c = fabricRef.current
    if (!c) return
    const active = c.getActiveObject()
    onSelectionChange?.(active)
    emitChange()
  }, [onSelectionChange])

  useEffect(() => {
    if (!canvasElRef.current || !containerRef.current) return
    let disposed = false

    const containerW = containerRef.current.offsetWidth
    const scale = containerW / CANVAS_W

    const c = new FabricCanvas(canvasElRef.current, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: "#1a1a2e",
      preserveObjectStacking: true,
    })
    c.setZoom(scale)
    c.setDimensions({ width: CANVAS_W * scale, height: CANVAS_H * scale }, { cssOnly: true })
    fabricRef.current = c
    setReady(true)

    if (initialImageUrl) {
      FabricImage.fromURL(initialImageUrl, { crossOrigin: "anonymous" })
        .then((img) => {
          if (disposed) return
          img.set({
            left: 0,
            top: 0,
            scaleX: CANVAS_W / (img.width || CANVAS_W),
            scaleY: CANVAS_H / (img.height || CANVAS_H),
            selectable: false,
            evented: false,
            name: "background",
          })
          c.add(img)
          c.sendToBack(img)
          c.renderAll()
        })
        .catch((e) => console.error("Failed to load canvas background", e))
    }

    c.on("selection:created", handleSelection)
    c.on("selection:updated", handleSelection)
    c.on("selection:cleared", () => {
      onSelectionChange?.(null)
      emitChange()
    })
    c.on("object:modified", emitChange)
    c.on("object:added", emitChange)
    c.on("object:removed", emitChange)

    return () => {
      disposed = true
      c.dispose()
    }
  }, [initialImageUrl])

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <canvas ref={canvasElRef} />
    </div>
  )
})

export default Canvas
