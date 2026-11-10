// 服务端组件：渲染前再次消毒（纵深防御），再交给客户端组件处理图片放大
import { sanitizeRich } from "@/lib/sanitize";
import RichView from "./RichView";

export default function Rich({ html, empty }: { html: string; empty?: string }) {
  return <RichView html={sanitizeRich(html)} empty={empty} />;
}
