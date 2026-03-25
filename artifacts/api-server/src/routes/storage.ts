import { Router, type IRouter } from "express";

const router: IRouter = Router();

const store = new Map<string, string>();

router.get("/storage/get/:key", (req, res) => {
  const { key } = req.params;
  const value = store.get(key);
  res.json({ value: value ?? null });
});

router.post("/storage/set/:key", (req, res) => {
  const { key } = req.params;
  const { value } = req.body as { value: string };
  store.set(key, value);
  res.json({ success: true });
});

router.delete("/storage/delete/:key", (req, res) => {
  const { key } = req.params;
  store.delete(key);
  res.json({ success: true });
});

router.get("/storage/list", (req, res) => {
  const prefix = (req.query.prefix as string) || "";
  const keys = Array.from(store.keys()).filter((k) => k.startsWith(prefix));
  res.json({ keys });
});

export default router;
