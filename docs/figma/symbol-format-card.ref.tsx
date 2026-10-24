type FormatCardProps = {
  className?: string;
  badge?: string;
  description?: string;
  extensions?: string;
  showBadge?: boolean;
  title?: string;
};

export default function FormatCard({ className, badge = "3D", description = "Full 3D volume. Tumor is registered to the atlas in 3D.", extensions = ".nii  .nii.gz", showBadge = true, title = "NIfTI volume" }: FormatCardProps) {
  return (
    <div className={className || "bg-[rgba(251,249,245,0.86)] border border-[#c1c7ce] border-solid content-stretch flex flex-col gap-[10px] items-start p-[16px] relative rounded-[12px] w-[205px]"} data-node-id="44:39" data-name="Format Card">
      <div className="content-stretch flex items-center justify-between overflow-clip relative shrink-0 w-full" data-node-id="44:40" data-name="Top">
        <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#151c22] text-[14px] whitespace-nowrap" data-node-id="44:41">
          {title}
        </p>
        {showBadge && (
          <div className="bg-[#e2f1e6] content-stretch flex items-start overflow-clip px-[8px] py-[2px] relative rounded-[999px] shrink-0" data-node-id="44:42" data-name="Badge">
            <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#2e6b47] text-[10px] whitespace-nowrap" data-node-id="44:43">
              {badge}
            </p>
          </div>
        )}
      </div>
      <div className="bg-[#e3eef4] content-stretch flex items-start overflow-clip px-[8px] py-[4px] relative rounded-[6px] shrink-0" data-node-id="44:44" data-name="Extension">
        <p className="[word-break:break-word] font-['Cousine:Regular'] leading-[normal] not-italic relative shrink-0 text-[#1f5673] text-[12px] whitespace-pre" data-node-id="44:45">
          {extensions}
        </p>
      </div>
      <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] min-w-full relative shrink-0 text-[#71787e] text-[12px] w-[min-content]" data-node-id="44:46">
        {description}
      </p>
    </div>
  );
}