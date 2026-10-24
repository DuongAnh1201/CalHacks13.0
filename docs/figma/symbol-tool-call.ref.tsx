const assetPathPrefix = "./assets";
const imgIcon = `${assetPathPrefix}/f8d34.svg`;

type ToolCallProps = {
  className?: string;
  call?: string;
  latency?: string;
};

export default function ToolCall({ className, call = 'focus_region("right_temporal")', latency = "12 ms" }: ToolCallProps) {
  return (
    <div className={className || "bg-[#f3f5f7] content-stretch flex gap-[8px] items-center px-[10px] py-[6px] relative rounded-[6px] w-[300px]"} data-node-id="45:30" data-name="Tool Call">
      <div className="relative shrink-0 size-[12px]" data-node-id="45:31" data-name="Icon">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon} />
      </div>
      <p className="[word-break:break-word] flex-[1_0_0] font-['Cousine:Regular'] leading-[normal] min-w-px not-italic relative text-[#151c22] text-[11px]" data-node-id="45:33">
        {call}
      </p>
      <p className="[word-break:break-word] font-['Cousine:Regular'] leading-[normal] not-italic relative shrink-0 text-[#71787e] text-[10px] whitespace-nowrap" data-node-id="45:34">
        {latency}
      </p>
    </div>
  );
}
