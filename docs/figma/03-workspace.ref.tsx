const assetPathPrefix = "./assets";
const imgIcon = `${assetPathPrefix}/f8d34.svg`;
const imgAb6AXuBpjgxbFyXqo4IduhBrP1MGuJqgLyuAa59Os8XiWdx0NIe1PIzDsbGNpro5OuKe29Yqyq6L4CJzTcXibLo4GCJctMteYyz4UfKv732IXmnPXn8Olj6Lzx6XBbeCdkH7MfA0ROdltdqy1GsZhuTjO9Xs01DjHltWd8WahPz7UTivYXkMCVc4DIzVvS9Rh1XstGj2Fbh2E9658NXl43YoRoArnheWl2IHfhsql35 = `${assetPathPrefix}/8ad8d.png`;
const imgAb6AXuC0WWrfhZhHGdSaTlFUl2SoJjIjlFb4GoroS291So8FrMeS1RfxaS1XwNquOwg04FqjvkFxXePik4X7QitLnfyzI1JrvhGhKREv7A7PSuso2E1Uvr026Rpg70NwsSOpauxWzqwpLpY9XsPuYT1OdWp4NaJredsdTszHdBmxOstu79YIlHhLaQjmS40QPyjd64PpmOi8MEj2TFQg7ZVbwuTqNwFxnQ60C = `${assetPathPrefix}/6a58f.png`;
const imgAb6AXuDcn0TtdX7Dlk3JoRhoFGhFvODg8WWcWjva8TRHa0E20XkhszevtANbQlabzamiNinpyzg3KWasRiKaXnsD9Y2LqcBt7EnK7FeHsdaXsK63IeIpldbg2CEdSfa0QqbDr97NeByrxeUNucM1H3VcVj6Snj2ThKt78YSbCqu2AuLwJwzcbOg31QeYsMx61Jnahqhn7BKp1VzcCfmVkptUmgg5Xn5Nf3RFz4Dvc = `${assetPathPrefix}/304b1.png`;
const imgContainer = `${assetPathPrefix}/d8bf0.svg`;
const imgIcon1 = `${assetPathPrefix}/3f35e.svg`;
const imgEllipse = `${assetPathPrefix}/c9605.svg`;
const imgEllipse1 = `${assetPathPrefix}/78c7f.svg`;
const imgEllipse2 = `${assetPathPrefix}/61a1b.svg`;
const imgIcon2 = `${assetPathPrefix}/8e97a.svg`;
const imgIcon3 = `${assetPathPrefix}/6179e.svg`;
const imgIcon4 = `${assetPathPrefix}/941c5.svg`;
const imgIcon5 = `${assetPathPrefix}/2623b.svg`;
const imgIcon6 = `${assetPathPrefix}/bfdea.svg`;
const imgIcon7 = `${assetPathPrefix}/81241.svg`;
const imgContainer1 = `${assetPathPrefix}/c9b37.svg`;
const imgContainer2 = `${assetPathPrefix}/e74d7.svg`;
const imgContainer3 = `${assetPathPrefix}/05ed5.svg`;
const imgContainer4 = `${assetPathPrefix}/c18f8.svg`;
const imgContainer5 = `${assetPathPrefix}/94482.svg`;
const imgContainer6 = `${assetPathPrefix}/e5b0c.svg`;
const imgContainer7 = `${assetPathPrefix}/d8034.svg`;
const imgContainer8 = `${assetPathPrefix}/1dae3.svg`;
const imgContainer9 = `${assetPathPrefix}/77060.svg`;
const imgContainer10 = `${assetPathPrefix}/79880.svg`;
const imgContainer11 = `${assetPathPrefix}/76bfc.svg`;
const imgContainer12 = `${assetPathPrefix}/49072.svg`;
const imgContainer13 = `${assetPathPrefix}/3ad0c.svg`;
const imgContainer14 = `${assetPathPrefix}/42112.svg`;
const imgContainer15 = `${assetPathPrefix}/5f73c.svg`;
const imgContainer16 = `${assetPathPrefix}/030d1.svg`;
const imgContainer17 = `${assetPathPrefix}/52b59.svg`;

type ToolCallProps = {
  className?: string;
  call?: string;
  latency?: string;
};

function ToolCall({ className, call = 'focus_region("right_temporal")', latency = "12 ms" }: ToolCallProps) {
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

export default function Component03MriWorkspaceAgent() {
  return (
    <div className="content-stretch flex flex-col items-start relative size-full" data-node-id="43:767" style={{ backgroundImage: "linear-gradient(90deg, rgb(246, 249, 255) 0%, rgb(246, 249, 255) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)" }} data-name="03 · MRI Workspace + Agent">
      <div className="gap-x-[24px] gap-y-[24px] grid grid-cols-[repeat(12,minmax(0,1fr))] grid-rows-[_1141px] max-w-[1720px] pb-[80px] pt-[96px] px-[24px] relative shrink-0 w-full" data-node-id="43:768" data-name="Main - MAIN MULTI-PLANAR WORKSPACE CANVAS">
        <div className="col-[1/span_3] content-stretch flex flex-col gap-[20px] h-[1140px] items-start justify-self-stretch relative row-1 self-start shrink-0" data-node-id="43:769" data-name="Section - LEFT COLUMN: Patient Info, Dataset Upload & Planar Selector (3 cols)">
          <div className="backdrop-blur-[9px] bg-[rgba(251,249,245,0.86)] border border-[rgba(193,199,206,0.3)] border-solid content-stretch flex flex-col gap-[12px] items-start p-[21px] relative rounded-[12px] shrink-0 w-full" data-node-id="43:770" data-name="Patient Dataset Record Card">
            <div className="absolute inset-[-1px] pointer-events-none rounded-[12px] shadow-[0px_4px_20px_-2px_rgba(30,37,43,0.04)]" data-node-id="43:771" data-name="Patient Dataset Record Card:shadow">
              <div aria-hidden className="absolute bg-[rgba(255,255,255,0)] bg-clip-padding border-0 border-[transparent] border-solid inset-0 rounded-[12px]" />
              <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_1px_0px_1px_rgba(255,255,255,0.8)]" />
            </div>
            <div className="border-[rgba(193,199,206,0.2)] border-b border-solid relative shrink-0 w-full" data-node-id="43:772" data-name="HorizontalBorder">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between pb-[13px] relative size-full">
                <div className="relative shrink-0" data-node-id="43:773" data-name="Container">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center relative size-full">
                    <div className="h-[13.333px] relative shrink-0 w-[16.667px]" data-node-id="43:774" data-name="Container">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer} />
                    </div>
                    <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:776" data-name="Container">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[16px] whitespace-nowrap" data-node-id="43:777">
                        <p className="leading-[24px]">Patient Dataset</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-[#b7eccc] relative rounded-[4px] shrink-0" data-node-id="43:778" data-name="Background">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start px-[8px] py-[2px] relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#3c6c53] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:779">
                      <p className="leading-[14px]">Verified NIfTI</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative shrink-0 w-full" data-node-id="43:780" data-name="Container">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[12px] items-start relative size-full">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="43:781" data-name="Container">
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="43:782" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.5px] uppercase w-full" data-node-id="43:783">
                      <p className="leading-[14px]">DEIDENTIFIED SUBJECT ID</p>
                    </div>
                  </div>
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="43:784" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#1f5673] text-[16px] w-full" data-node-id="43:785">
                      <p className="leading-[24px]">NV-2024-884 (Deidentified)</p>
                    </div>
                  </div>
                </div>
                <div className="gap-x-[8px] gap-y-[8px] grid grid-cols-[repeat(2,minmax(0,1fr))] grid-rows-[__46px_46px] pt-[4px] relative shrink-0 w-full" data-node-id="43:786" data-name="Container">
                  <div className="bg-[rgba(255,255,255,0.9)] border border-[rgba(193,199,206,0.2)] border-solid col-1 content-stretch flex flex-col items-start justify-self-stretch p-[9px] relative rounded-[4px] row-1 self-start shrink-0" data-node-id="43:787" data-name="Overlay+Border">
                    <div className="relative shrink-0 w-full" data-node-id="43:788" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] w-full" data-node-id="43:789">
                          <p className="leading-[14px]">Scan Modality</p>
                        </div>
                      </div>
                    </div>
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:790">
                      <p className="leading-[14px]">T1-Weighted + CE</p>
                    </div>
                  </div>
                  <div className="bg-[rgba(255,255,255,0.9)] border border-[rgba(193,199,206,0.2)] border-solid col-2 content-stretch flex flex-col items-start justify-self-stretch p-[9px] relative rounded-[4px] row-1 self-start shrink-0" data-node-id="43:791" data-name="Overlay+Border">
                    <div className="relative shrink-0 w-full" data-node-id="43:792" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] w-full" data-node-id="43:793">
                          <p className="leading-[14px]">Matrix Resolution</p>
                        </div>
                      </div>
                    </div>
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:794">
                      <p className="leading-[14px]">512 × 512 × 240</p>
                    </div>
                  </div>
                  <div className="bg-[rgba(255,255,255,0.9)] border border-[rgba(193,199,206,0.2)] border-solid col-1 content-stretch flex flex-col items-start justify-self-stretch p-[9px] relative rounded-[4px] row-2 self-start shrink-0" data-node-id="43:795" data-name="Overlay+Border">
                    <div className="relative shrink-0 w-full" data-node-id="43:796" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] w-full" data-node-id="43:797">
                          <p className="leading-[14px]">Voxel Spacing</p>
                        </div>
                      </div>
                    </div>
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:798">
                      <p className="leading-[14px]">0.9 × 0.9 × 1.0 mm</p>
                    </div>
                  </div>
                  <div className="bg-[rgba(255,255,255,0.9)] border border-[rgba(193,199,206,0.2)] border-solid col-2 content-stretch flex flex-col items-start justify-self-stretch p-[9px] relative rounded-[4px] row-2 self-start shrink-0" data-node-id="43:799" data-name="Overlay+Border">
                    <div className="relative shrink-0 w-full" data-node-id="43:800" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] w-full" data-node-id="43:801">
                          <p className="leading-[14px]">Acquisition Field</p>
                        </div>
                      </div>
                    </div>
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:802">
                      <p className="leading-[14px]">3.0 Tesla MR</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="backdrop-blur-[12px] bg-[rgba(255,255,255,0.92)] border border-[#1f5673] border-solid content-stretch flex flex-[1_0_0] flex-col gap-[14px] items-start min-h-px overflow-clip pb-[16px] pt-[20px] px-[20px] relative rounded-[12px] w-full" data-node-id="44:271" data-name="Neuro Agent Panel">
            <div className="content-stretch flex gap-[10px] items-center overflow-clip relative shrink-0 w-full" data-node-id="44:272" data-name="Agent Header">
              <div className="bg-gradient-to-r content-stretch flex from-[#2e6b8f] items-center justify-center overflow-clip relative rounded-[999px] shrink-0 size-[32px] to-[#1f4d66]" data-node-id="44:273" data-name="Agent Avatar">
                <div className="relative shrink-0 size-[16px]" data-node-id="44:274" data-name="Icon">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon1} />
                </div>
              </div>
              <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-px items-start leading-[normal] min-w-px overflow-clip relative whitespace-nowrap" data-node-id="44:276" data-name="Title">
                <p className="font-['Manrope:Bold'] font-bold relative shrink-0 text-[#151c22] text-[15px]" data-node-id="44:277">
                  Neuro Agent
                </p>
                <p className="font-['Manrope:Medium'] font-medium relative shrink-0 text-[#71787e] text-[11px]" data-node-id="44:278">{`Voice & script control for the workspace`}</p>
              </div>
              <div className="bg-[#e2f1e6] content-stretch flex gap-[6px] items-center overflow-clip px-[10px] py-[4px] relative rounded-[999px] shrink-0" data-node-id="44:279" data-name="Status — Listening">
                <div className="relative shrink-0 size-[7px]" data-node-id="44:280" data-name="Ellipse">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse} />
                </div>
                <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#2e6b47] text-[11px] whitespace-nowrap" data-node-id="44:281">
                  Listening
                </p>
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-[8px] items-start overflow-clip relative shrink-0 w-full" data-node-id="44:282" data-name="Sub-agents">
              <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.8px] whitespace-nowrap" data-node-id="44:283">
                AGENTS ON THIS CASE
              </p>
              <div className="content-start flex flex-wrap gap-[6px] items-start overflow-clip relative shrink-0 w-full" data-node-id="44:284" data-name="Agent Chips">
                <div className="bg-[#fbf9f5] border border-[#c1c7ce] border-solid content-stretch flex gap-[6px] items-center overflow-clip px-[8px] py-[5px] relative rounded-[999px] shrink-0" data-node-id="44:285" data-name="Chip — Orchestrator">
                  <div className="relative shrink-0 size-[6px]" data-node-id="44:286" data-name="Ellipse">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse1} />
                  </div>
                  <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] relative shrink-0 text-[#71787e] text-[11px] whitespace-nowrap" data-node-id="44:287">
                    Orchestrator
                  </p>
                </div>
                <div className="bg-[#fbf9f5] border border-[#c1c7ce] border-solid content-stretch flex gap-[6px] items-center overflow-clip px-[8px] py-[5px] relative rounded-[999px] shrink-0" data-node-id="44:288" data-name="Chip — Vision">
                  <div className="relative shrink-0 size-[6px]" data-node-id="44:289" data-name="Ellipse">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse1} />
                  </div>
                  <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] relative shrink-0 text-[#71787e] text-[11px] whitespace-nowrap" data-node-id="44:290">
                    Vision
                  </p>
                </div>
                <div className="bg-[#e3eef4] border border-[rgba(31,86,115,0.6)] border-solid content-stretch flex gap-[6px] items-center overflow-clip px-[8px] py-[5px] relative rounded-[999px] shrink-0" data-node-id="44:291" data-name="Chip — Spatial UI">
                  <div className="relative shrink-0 size-[6px]" data-node-id="44:292" data-name="Ellipse">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse2} />
                  </div>
                  <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#1f5673] text-[11px] whitespace-nowrap" data-node-id="44:293">
                    Spatial UI
                  </p>
                </div>
                <div className="bg-[#fbf9f5] border border-[#c1c7ce] border-solid content-stretch flex gap-[6px] items-center overflow-clip px-[8px] py-[5px] relative rounded-[999px] shrink-0" data-node-id="44:294" data-name="Chip — Clinical Reasoner">
                  <div className="relative shrink-0 size-[6px]" data-node-id="44:295" data-name="Ellipse">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse1} />
                  </div>
                  <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] relative shrink-0 text-[#71787e] text-[11px] whitespace-nowrap" data-node-id="44:296">
                    Clinical
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-[#eef0f2] content-stretch flex gap-[3px] items-start overflow-clip p-[3px] relative rounded-[10px] shrink-0 w-full" data-node-id="44:297" data-name="Mode Tabs">
              <div className="bg-white content-stretch flex flex-[1_0_0] gap-[6px] items-center justify-center min-w-px overflow-clip py-[7px] relative rounded-[8px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.08)]" data-node-id="44:298" data-name="Tab — Voice">
                <div className="relative shrink-0 size-[14px]" data-node-id="44:299" data-name="Icon">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon2} />
                </div>
                <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#1f5673] text-[12px] whitespace-nowrap" data-node-id="44:302">
                  Voice
                </p>
              </div>
              <div className="content-stretch flex flex-[1_0_0] gap-[6px] items-center justify-center min-w-px overflow-clip py-[7px] relative rounded-[8px]" data-node-id="44:303" data-name="Tab — Script">
                <div className="relative shrink-0 size-[14px]" data-node-id="44:304" data-name="Icon">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon3} />
                </div>
                <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#71787e] text-[12px] whitespace-nowrap" data-node-id="44:307">
                  Script
                </p>
              </div>
            </div>
            <div className="content-stretch flex flex-[1_0_0] flex-col gap-[12px] items-start justify-end min-h-px overflow-clip relative w-full" data-node-id="45:35" data-name="Conversation Log">
              <div className="bg-[#fbf9f5] border border-[#c1c7ce] border-solid content-stretch flex gap-[8px] items-center overflow-clip px-[10px] py-[8px] relative rounded-[8px] shrink-0 w-full" data-node-id="45:127" data-name="Msg — Vision (system)">
                <div className="relative shrink-0 size-[14px]" data-node-id="45:128" data-name="Icon">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon4} />
                </div>
                <p className="[word-break:break-word] flex-[1_0_0] font-['Manrope:Medium'] font-medium leading-[0] min-w-px relative text-[#151c22] text-[11px]" data-node-id="45:131">
                  <span className="font-['Manrope:Bold'] font-bold leading-[normal] text-[#2e6b47]">Vision agent</span>
                  <span className="leading-[normal]">{` · Segmentation done: 14.8 cm³, right temporal lobe`}</span>
                </p>
              </div>
              <div className="content-stretch flex items-start justify-end overflow-clip relative shrink-0 w-full" data-node-id="45:41" data-name="Msg — User (voice)">
                <div className="bg-[#1f5673] content-stretch flex flex-col gap-[4px] items-start overflow-clip px-[12px] py-[10px] relative rounded-[10px] shrink-0 w-[280px]" data-node-id="45:42" data-name="Bubble">
                  <div className="content-stretch flex gap-[6px] items-center overflow-clip relative shrink-0" data-node-id="45:43" data-name="Meta">
                    <div className="relative shrink-0 size-[11px]" data-node-id="45:44" data-name="Icon">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon5} />
                    </div>
                    <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] relative shrink-0 text-[#cfe0eb] text-[10px] whitespace-nowrap" data-node-id="45:47">
                      You · voice · 10:42
                    </p>
                  </div>
                  <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] min-w-full relative shrink-0 text-[12px] text-white w-[min-content]" data-node-id="45:48">
                    “Show me the tumor on the axial slice.”
                  </p>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[8px] items-start overflow-clip relative shrink-0 w-full" data-node-id="45:49" data-name="Msg — Agent">
                <div className="[word-break:break-word] content-stretch flex gap-[6px] items-center leading-[normal] overflow-clip relative shrink-0 whitespace-nowrap" data-node-id="45:50" data-name="Meta">
                  <p className="font-['Manrope:Bold'] font-bold relative shrink-0 text-[#1f5673] text-[11px]" data-node-id="45:51">
                    Neuro · Spatial UI
                  </p>
                  <p className="font-['Manrope:Medium'] font-medium relative shrink-0 text-[#71787e] text-[10px]" data-node-id="45:52">
                    10:42
                  </p>
                </div>
                <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] min-w-full relative shrink-0 text-[#151c22] text-[12px] w-[min-content]" data-node-id="45:53">
                  Done. Axial slice 112 is centered on the tumor.
                </p>
                <div className="content-stretch flex flex-col gap-[4px] items-start overflow-clip relative shrink-0 w-full" data-node-id="45:54" data-name="Tool Calls">
                  <ToolCall call="inspect_mri_slice('axial', 112)" className="bg-[#f3f5f7] content-stretch flex gap-[8px] items-center px-[10px] py-[6px] relative rounded-[6px] shrink-0 w-full" latency="18 ms" />
                  <ToolCall className="bg-[#f3f5f7] content-stretch flex gap-[8px] items-center px-[10px] py-[6px] relative rounded-[6px] shrink-0 w-full" />
                </div>
              </div>
              <div className="content-stretch flex items-start justify-end overflow-clip relative shrink-0 w-full" data-node-id="45:70" data-name="Msg — User (voice)">
                <div className="bg-[#1f5673] content-stretch flex flex-col gap-[4px] items-start overflow-clip px-[12px] py-[10px] relative rounded-[10px] shrink-0 w-[280px]" data-node-id="45:71" data-name="Bubble">
                  <div className="content-stretch flex gap-[6px] items-center overflow-clip relative shrink-0" data-node-id="45:72" data-name="Meta">
                    <div className="relative shrink-0 size-[11px]" data-node-id="45:73" data-name="Icon">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon5} />
                    </div>
                    <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] relative shrink-0 text-[#cfe0eb] text-[10px] whitespace-nowrap" data-node-id="45:76">
                      You · voice · 10:43
                    </p>
                  </div>
                  <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] min-w-full relative shrink-0 text-[12px] text-white w-[min-content]" data-node-id="45:77">
                    “Okay, place it on the 3D brain.”
                  </p>
                </div>
              </div>
              <div className="bg-[#e3eef4] border border-[rgba(31,86,115,0.5)] border-solid content-stretch flex flex-col gap-[10px] items-start overflow-clip p-[12px] relative rounded-[10px] shrink-0 w-full" data-node-id="45:78" data-name="Msg — Agent Confirm">
                <div className="[word-break:break-word] content-stretch flex gap-[6px] items-center leading-[normal] overflow-clip relative shrink-0 whitespace-nowrap" data-node-id="45:79" data-name="Meta">
                  <p className="font-['Manrope:Bold'] font-bold relative shrink-0 text-[#1f5673] text-[11px]" data-node-id="45:80">
                    Neuro · Orchestrator
                  </p>
                  <p className="font-['Manrope:Medium'] font-medium relative shrink-0 text-[#71787e] text-[10px]" data-node-id="45:81">
                    10:43
                  </p>
                </div>
                <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] min-w-full relative shrink-0 text-[#151c22] text-[12px] w-[min-content]" data-node-id="45:82">
                  Ready to place the 14.8 cm³ tumor at the right temporal lobe on the 3D brain. Go ahead?
                </p>
                <div className="content-stretch flex gap-[8px] items-start overflow-clip relative shrink-0 w-full" data-node-id="45:83" data-name="Actions">
                  <a className="bg-[#1f5673] content-stretch cursor-pointer flex flex-[1_0_0] items-center justify-center min-w-px overflow-clip py-[8px] relative rounded-[8px]" data-node-id="45:84" data-name="Button — Place in 3D">
                    <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[12px] text-left text-white whitespace-nowrap" data-node-id="45:85">
                      Place in 3D
                    </p>
                  </a>
                  <div className="bg-white border border-[#c1c7ce] border-solid content-stretch flex flex-[1_0_0] items-center justify-center min-w-px overflow-clip py-[8px] relative rounded-[8px]" data-node-id="45:86" data-name="Button — Not now">
                    <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#151c22] text-[12px] whitespace-nowrap" data-node-id="45:87">
                      Not now
                    </p>
                  </div>
                </div>
                <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] relative shrink-0 text-[#71787e] text-[10px] whitespace-nowrap" data-node-id="45:88">
                  Or say “yes” · pinch to confirm
                </p>
              </div>
            </div>
            <div className="bg-[#14222c] content-stretch flex flex-col items-start overflow-clip relative rounded-[10px] shrink-0 w-full" data-node-id="45:89" data-name="Script Block">
              <div className="content-stretch flex gap-[8px] items-center overflow-clip pl-[12px] pr-[8px] py-[8px] relative shrink-0 w-full" data-node-id="45:90" data-name="Script Header">
                <p className="[word-break:break-word] flex-[1_0_0] font-['Cousine:Regular'] leading-[normal] min-w-px not-italic relative text-[#7d93a3] text-[11px]" data-node-id="45:91">
                  case_tour.neuro
                </p>
                <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] relative shrink-0 text-[#7d93a3] text-[10px] whitespace-nowrap" data-node-id="45:92">
                  3 steps
                </p>
                <div className="bg-[#8fc7e8] content-stretch flex gap-[4px] items-center overflow-clip px-[10px] py-[5px] relative rounded-[6px] shrink-0" data-node-id="45:93" data-name="Button — Run script">
                  <div className="relative shrink-0 size-[10px]" data-node-id="45:94" data-name="Icon">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon6} />
                  </div>
                  <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#14222c] text-[11px] whitespace-nowrap" data-node-id="45:96">
                    Run
                  </p>
                </div>
              </div>
              <div className="[word-break:break-word] border-[rgba(255,255,255,0.08)] border-solid border-t content-stretch flex flex-col font-['Cousine:Regular'] gap-[4px] items-start leading-[0] not-italic overflow-clip pb-[12px] pt-[8px] px-[12px] relative shrink-0 text-[11px] text-white w-full whitespace-pre" data-node-id="45:97" data-name="Script Lines">
                <p className="relative shrink-0" data-node-id="45:98">
                  <span className="leading-[normal] text-[#7d93a3]">{`1 `}</span>
                  <span className="leading-[normal]">{` `}</span>
                  <span className="leading-[normal] text-[#8fc6e8]">set_cutaway</span>
                  <span className="leading-[normal]">(</span>
                  <span className="leading-[normal] text-[#e8b98f]">{`"axial", 112`}</span>
                  <span className="leading-[normal]">)</span>
                </p>
                <p className="relative shrink-0" data-node-id="45:99">
                  <span className="leading-[normal] text-[#7d93a3]">{`2 `}</span>
                  <span className="leading-[normal]">{` `}</span>
                  <span className="leading-[normal] text-[#8fc6e8]">explain_structure</span>
                  <span className="leading-[normal]">(</span>
                  <span className="leading-[normal] text-[#e8b98f]">{`"hippocampus", "brief"`}</span>
                  <span className="leading-[normal]">)</span>
                </p>
                <p className="relative shrink-0" data-node-id="45:100">
                  <span className="leading-[normal] text-[#7d93a3]">{`3 `}</span>
                  <span className="leading-[normal]">{` `}</span>
                  <span className="leading-[normal] text-[#8fc6e8]">place_tumor_3d</span>
                  <span className="leading-[normal]">(</span>
                  <span className="leading-[normal] text-[#e8b98f]">focus=true</span>
                  <span className="leading-[normal]">)</span>
                </p>
              </div>
            </div>
            <div className="bg-[#e3eef4] border border-[rgba(31,86,115,0.4)] border-solid content-stretch flex gap-[12px] items-center overflow-clip pl-[10px] pr-[14px] py-[10px] relative rounded-[999px] shrink-0 w-full" data-node-id="45:101" data-name="Voice Input Bar">
              <div className="bg-[#1f5673] content-stretch flex items-center justify-center overflow-clip relative rounded-[999px] shadow-[0px_0px_0px_6px_rgba(31,87,115,0.35)] shrink-0 size-[44px]" data-node-id="45:102" data-name="Mic Button — Active">
                <div className="relative shrink-0 size-[20px]" data-node-id="45:103" data-name="Icon">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon7} />
                </div>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px overflow-clip relative" data-node-id="45:107" data-name="Live Transcript">
                <div className="content-stretch flex gap-[3px] items-center overflow-clip relative shrink-0" data-node-id="45:108" data-name="Waveform">
                  <div className="bg-[#1f5673] h-[6px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:109" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[12px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:110" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[18px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:111" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[10px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:112" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[22px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:113" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[14px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:114" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[8px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:115" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[16px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:116" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[20px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:117" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[9px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:118" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[13px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:119" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[6px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:120" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[11px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:121" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[17px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:122" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[7px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:123" data-name="Rectangle" />
                  <div className="bg-[#1f5673] h-[4px] relative rounded-[2px] shrink-0 w-[3px]" data-node-id="45:124" data-name="Rectangle" />
                </div>
                <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] relative shrink-0 text-[#1f5673] text-[12px] whitespace-nowrap" data-node-id="45:125">
                  “…and lower the threshold to 0.4”
                </p>
                <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] relative shrink-0 text-[#71787e] text-[10px] whitespace-pre" data-node-id="45:126">{`Hold Space to talk  ·  Esc to stop`}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="col-[4/span_6] content-stretch flex flex-col gap-[16px] items-start justify-self-stretch relative row-1 self-start shrink-0" data-node-id="43:855" data-name="Section - CENTRAL VIEW: Synchronized Orthogonal MRI Views (6 cols)">
          <div className="backdrop-blur-[9px] bg-[rgba(251,249,245,0.86)] border border-[rgba(193,199,206,0.3)] border-solid content-stretch flex flex-col gap-[12px] items-start justify-center px-[21px] py-[13px] relative rounded-[12px] shrink-0 w-full" data-node-id="43:856" data-name="Multi-Planar Synchronizer Header">
            <div className="absolute inset-[-1px] pointer-events-none rounded-[12px] shadow-[0px_4px_20px_-2px_rgba(30,37,43,0.04)]" data-node-id="43:857" data-name="Multi-Planar Synchronizer Header:shadow">
              <div aria-hidden className="absolute bg-[rgba(255,255,255,0)] bg-clip-padding border-0 border-[transparent] border-solid inset-0 rounded-[12px]" />
              <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_1px_0px_1px_rgba(255,255,255,0.8)]" />
            </div>
            <div className="relative shrink-0" data-node-id="43:858" data-name="Container">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12px] items-center relative size-full">
                <div className="bg-[#b93f29] content-stretch flex flex-col items-start justify-center relative rounded-[9999px] shrink-0 size-[10px]" data-node-id="43:859" data-name="Background">
                  <div className="bg-[rgba(255,255,255,0)] relative rounded-[9999px] shadow-[0px_0px_0px_4px_rgba(255,218,211,0.5)] shrink-0 size-[10px]" data-node-id="43:860" data-name="Overlay+Shadow" />
                </div>
                <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:861" data-name="Heading 1">
                  <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[18px] tracking-[-0.09px] whitespace-nowrap" data-node-id="43:862">
                    <p className="leading-[26px]">Synchronized Multi-Planar Reconstruction (MPR)</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-[#edf4fd] border border-[rgba(193,199,206,0.3)] border-solid relative rounded-[8px] shrink-0" data-node-id="43:863" data-name="Windowing Presets">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[6px] items-center p-[5px] relative size-full">
                <div className="bg-white drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] relative rounded-[4px] shrink-0" data-node-id="43:864" data-name="Button">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center px-[10px] py-[4px] relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#1f5673] text-[10px] text-center tracking-[0.4px] whitespace-nowrap" data-node-id="43:865">
                      <p className="leading-[14px]">Brain (W:80 L:40)</p>
                    </div>
                  </div>
                </div>
                <div className="relative rounded-[4px] shrink-0" data-node-id="43:866" data-name="Button">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center px-[10px] py-[4px] relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] text-center tracking-[0.4px] whitespace-nowrap" data-node-id="43:867">
                      <p className="leading-[14px]">Bone</p>
                    </div>
                  </div>
                </div>
                <div className="relative rounded-[4px] shrink-0" data-node-id="43:868" data-name="Button">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center px-[10px] py-[4px] relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] text-center tracking-[0.4px] whitespace-nowrap" data-node-id="43:869">
                      <p className="leading-[14px]">Subdural</p>
                    </div>
                  </div>
                </div>
                <div className="relative rounded-[4px] shrink-0" data-node-id="43:870" data-name="Button">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center px-[10px] py-[4px] relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] text-center tracking-[0.4px] whitespace-nowrap" data-node-id="43:871">
                      <p className="leading-[14px]">Perfusion</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="gap-x-[16px] gap-y-[16px] grid grid-cols-[repeat(2,minmax(0,1fr))] grid-rows-[__585.44px_355.31px] relative shrink-0 w-full" data-node-id="43:872" data-name="Main Orthogonal Multi-Viewer Grid: Axial (dominant) + Sagittal & Coronal side-by-side">
            <div className="border border-[rgba(193,199,206,0.3)] border-solid col-[1/span_2] content-stretch flex flex-col gap-[8px] items-start justify-self-stretch overflow-clip p-[17px] relative rounded-[12px] row-1 self-start shadow-[0px_12px_32px_-4px_rgba(30,37,43,0.06)] shrink-0" data-node-id="43:873" data-name="1. AXIAL VIEW (Primary Plane) - Spans 2 cols on tablet/desktop for high precision">
              <div aria-hidden className="absolute backdrop-blur-[12px] bg-[rgba(255,255,255,0.92)] inset-0 pointer-events-none rounded-[12px]" />
              <div className="relative shrink-0 w-full" data-node-id="43:874" data-name="Container">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between relative size-full">
                  <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-node-id="43:875" data-name="Container">
                    <div className="bg-[#1f5673] content-stretch flex flex-col items-start px-[8px] py-[2px] relative rounded-[4px] shrink-0" data-node-id="43:876" data-name="Background">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[10px] text-white tracking-[0.4px] whitespace-nowrap" data-node-id="43:877">
                        <p className="leading-[14px]">AXIAL (Z)</p>
                      </div>
                    </div>
                    <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:878" data-name="Container">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[11px] tracking-[0.33px] whitespace-nowrap" data-node-id="43:879">
                        <p className="leading-[16px]">Horizontal Slice — Right Temporal Lobe Center</p>
                      </div>
                    </div>
                  </div>
                  <div className="content-stretch flex gap-[11.99px] items-center relative shrink-0" data-node-id="43:880" data-name="Container">
                    <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:881" data-name="Container">
                      <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Bold'] justify-center leading-[0] not-italic relative shrink-0 text-[#151c22] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:882">
                        <p className="leading-[14px]">Slice 112 / 240</p>
                      </div>
                    </div>
                    <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:883" data-name="Container">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:884">
                        <p className="leading-[14px]">Z: -14.2 mm</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="aspect-[16/10] border border-[rgba(193,199,206,0.2)] border-solid relative rounded-[8px] shrink-0 w-full" data-node-id="43:885" data-name="Axial Canvas Screen">
                <div aria-hidden className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 pointer-events-none rounded-[8px]" style={{ backgroundImage: "linear-gradient(90deg, rgba(65, 72, 77, 0.06) 4.1667%, rgba(65, 72, 77, 0) 4.1667%), linear-gradient(180deg, rgba(65, 72, 77, 0.06) 4.1667%, rgba(65, 72, 77, 0) 4.1667%), linear-gradient(90deg, rgb(12, 16, 20) 0%, rgb(12, 16, 20) 100%)" }} />
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center overflow-clip p-px relative rounded-[inherit] size-full">
                  <div className="flex-[1_0_0] h-full min-w-px opacity-90 relative" data-node-id="43:886" data-name="AB6AXuBPJGXBFyXqo4Iduh_BrP1mGUJqgLyuAa59Os8Xi_Wdx0nIe1pIZDsbGNpro5ouKE29YQYQ6l4cJZTcXIBLo4gCJctMteYYZ4UfKV732iXmnPXn8Olj6LZX6XBbeCdkH7mfA0ROdltdqy1gsZHUTjO9xs01djHLT-wd8wahPZ7uTivYXk_mCVc4d_IZVvS9Rh1xstGj2Fbh2e9658nXL43YORoArnheWL2iHfhsql35">
                    <div aria-hidden className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 pointer-events-none">
                      <div className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 overflow-hidden">
                        <img alt="" className="absolute h-full left-[-7.26%] max-w-none top-0 w-[114.52%]" src={imgAb6AXuBpjgxbFyXqo4IduhBrP1MGuJqgLyuAa59Os8XiWdx0NIe1PIzDsbGNpro5OuKe29Yqyq6L4CJzTcXibLo4GCJctMteYyz4UfKv732IXmnPXn8Olj6Lzx6XBbeCdkH7MfA0ROdltdqy1GsZhuTjO9Xs01DjHltWd8WahPz7UTivYXkMCVc4DIzVvS9Rh1XstGj2Fbh2E9658NXl43YoRoArnheWl2IHfhsql35} />
                      </div>
                      <div className="absolute bg-[#f2f2f2] bg-clip-padding border-0 border-[transparent] border-solid inset-0 mix-blend-multiply" />
                    </div>
                  </div>
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                    <div className="absolute bg-[rgba(31,86,115,0.4)] border-[rgba(31,86,115,0.6)] border-dashed border-r bottom-0 left-[478.33px] top-0 w-px" data-node-id="43:888" data-name="Vertical crosshair line (Sagittal reference)" />
                    <div className="absolute bg-[rgba(31,86,115,0.4)] border-[rgba(31,86,115,0.6)] border-b border-dashed h-px left-0 right-0 top-[259.97px]" data-node-id="43:889" data-name="Horizontal crosshair line (Coronal reference)" />
                    <div className="absolute bg-[rgba(185,63,41,0.2)] border-2 border-[#b93f29] border-solid content-stretch flex h-[80px] items-center justify-center left-[432.03px] p-[2px] rounded-[9999px] top-[231.08px] w-[96px]" data-node-id="43:890" data-name="Tumor Contour Outline Overlay (Right Temporal Lobe)">
                      <div className="bg-[#b93f29] relative rounded-[4px] shrink-0" data-node-id="43:891" data-name="Background">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start px-[6px] py-[2px] relative size-full">
                          <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Bold'] justify-center leading-[0] not-italic relative shrink-0 text-[9px] text-white tracking-[-0.45px] whitespace-nowrap" data-node-id="43:892">
                            <p className="leading-[22px]">ROI: 14.8 cm³</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Liberation_Mono:Bold'] justify-center leading-[0] left-[349.74px] not-italic text-[10px] text-[rgba(193,199,206,0.7)] top-[19px] whitespace-nowrap" data-node-id="43:893">
                      <p className="leading-[22px]">A (Anterior)</p>
                    </div>
                    <div className="absolute bottom-[8px] content-stretch flex flex-col items-start left-[346.74px] w-[78.02px]" data-node-id="43:894" data-name="Container">
                      <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Bold'] justify-center leading-[0] not-italic relative shrink-0 text-[10px] text-[rgba(193,199,206,0.7)] whitespace-nowrap" data-node-id="43:895">
                        <p className="leading-[22px]">P (Posterior)</p>
                      </div>
                    </div>
                    <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Liberation_Mono:Bold'] justify-center leading-[0] left-[8px] not-italic text-[10px] text-[rgba(193,199,206,0.7)] top-[240.72px] whitespace-nowrap" data-node-id="43:896">
                      <p className="leading-[22px]">R</p>
                    </div>
                    <div className="absolute content-stretch flex flex-col h-[22px] items-start right-[8px] top-[229.72px]" data-node-id="43:897" data-name="Container">
                      <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Bold'] justify-center leading-[0] not-italic relative shrink-0 text-[10px] text-[rgba(193,199,206,0.7)] whitespace-nowrap" data-node-id="43:898">
                        <p className="leading-[22px]">L</p>
                      </div>
                    </div>
                  </div>
                  <div className="absolute backdrop-blur-[6px] bg-[rgba(255,255,255,0.8)] border border-[rgba(193,199,206,0.3)] border-solid bottom-[12px] left-[12px] rounded-[4px]" data-node-id="43:899" data-name="In-canvas HUD telemetry">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start px-[11px] py-[5px] relative size-full">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#b93f29] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:900">
                        <p>
                          <span className="leading-[14px]">● High Uptake Rim</span>
                          <span className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[14px] text-[#151c22]">{` | HU: +42.1`}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="absolute backdrop-blur-[2px] bg-[rgba(42,49,55,0.8)] right-[12px] rounded-[4px] top-[12px]" data-node-id="43:901" data-name="Overlay+OverlayBlur">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[5.99px] items-center px-[8px] py-[4px] relative size-full">
                      <div className="relative shrink-0 size-[12.833px]" data-node-id="43:902" data-name="Container">
                        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer1} />
                      </div>
                      <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:904" data-name="Container">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#ebf1fa] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:905">
                          <p className="leading-[14px]">1.85×</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)]" />
              </div>
              <div className="relative shrink-0 w-full" data-node-id="43:906" data-name="Interactive Slice Slider">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[16px] items-center pt-[4px] relative size-full">
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:907" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:908">
                      <p className="leading-[14px]">1</p>
                    </div>
                  </div>
                  <div className="bg-[#dce3eb] flex-[1_0_0] h-[6px] min-w-px relative rounded-[8px]" data-node-id="43:909" data-name="Input">
                    <div className="absolute content-stretch flex items-center left-0 right-[-0.1px] top-[-5px]" data-node-id="43:910" data-name="Container">
                      <div className="flex-[1_0_0] h-[16px] min-w-px relative" data-node-id="43:911" data-name="Container" />
                    </div>
                  </div>
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:912" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:913">
                      <p className="leading-[14px]">240</p>
                    </div>
                  </div>
                  <div className="content-stretch flex gap-[4px] items-center relative shrink-0" data-node-id="43:914" data-name="Container">
                    <div className="content-stretch flex flex-col items-center justify-center pb-[4.78px] pt-[7.22px] px-[4px] relative rounded-[4px] shrink-0" data-node-id="43:915" data-name="Button">
                      <div className="h-[9px] relative shrink-0 w-[5.55px]" data-node-id="43:916" data-name="Container">
                        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer2} />
                      </div>
                    </div>
                    <div className="content-stretch flex flex-col items-center justify-center pb-[4.78px] pt-[7.22px] px-[4px] relative rounded-[4px] shrink-0" data-node-id="43:918" data-name="Button">
                      <div className="h-[9px] relative shrink-0 w-[5.55px]" data-node-id="43:919" data-name="Container">
                        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer3} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_1px_0px_1px_rgba(255,255,255,0.9)]" />
            </div>
            <div className="backdrop-blur-[12px] bg-[rgba(255,255,255,0.92)] border border-[rgba(193,199,206,0.3)] border-solid col-1 h-[355.31px] justify-self-stretch relative rounded-[12px] row-2 shrink-0" data-node-id="43:921" data-name="2. SAGITTAL VIEW (Side Plane)">
              <div className="absolute inset-[-1px] pointer-events-none rounded-[12px] shadow-[0px_12px_32px_-4px_rgba(30,37,43,0.06)]" data-node-id="43:922" data-name="2. SAGITTAL VIEW (Side Plane):shadow">
                <div aria-hidden className="absolute bg-[rgba(255,255,255,0)] inset-0 rounded-[12px]" />
                <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_1px_0px_1px_rgba(255,255,255,0.9)]" />
              </div>
              <div className="absolute content-stretch flex flex-col items-start left-[16px] pb-[8px] right-[16px] top-[16px]" data-node-id="43:923" data-name="Margin">
                <div className="content-stretch flex items-center justify-between relative shrink-0 w-full" data-node-id="43:924" data-name="Container">
                  <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-node-id="43:925" data-name="Container">
                    <div className="bg-[#3b6e8c] content-stretch flex flex-col items-start px-[8px] py-[2px] relative rounded-[4px] shrink-0" data-node-id="43:926" data-name="Background">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[10px] text-white tracking-[0.4px] whitespace-nowrap" data-node-id="43:927">
                        <p className="leading-[14px]">SAGITTAL (X)</p>
                      </div>
                    </div>
                    <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:928" data-name="Container">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:929">
                        <p className="leading-[14px]">Lateral Cut</p>
                      </div>
                    </div>
                  </div>
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:930" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:931">
                      <p className="leading-[14px]">Slice 138/256</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute content-stretch flex flex-col items-start left-[16px] pt-[10px] right-[16px] top-[313.31px]" data-node-id="43:932" data-name="Mini slider:margin">
                <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-node-id="43:933" data-name="Mini slider">
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:934" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:935">
                      <p className="leading-[14px]">X:</p>
                    </div>
                  </div>
                  <div className="bg-[#dce3eb] flex-[1_0_0] h-[4px] min-w-px relative rounded-[4px]" data-node-id="43:936" data-name="Input">
                    <div className="absolute content-stretch flex items-center left-0 right-0 top-[-6px]" data-node-id="43:937" data-name="Container">
                      <div className="flex-[1_0_0] h-[16px] min-w-px relative" data-node-id="43:938" data-name="Container" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute aspect-[4/3] border border-[rgba(193,199,206,0.2)] border-solid content-stretch flex items-center justify-center left-[16px] overflow-clip p-px right-[16px] rounded-[8px] top-[42px]" data-node-id="43:939" data-name="Background+Border+Shadow">
                <div aria-hidden className="absolute inset-0 pointer-events-none rounded-[8px]" style={{ backgroundImage: "linear-gradient(90deg, rgba(65, 72, 77, 0.06) 4.1667%, rgba(65, 72, 77, 0) 4.1667%), linear-gradient(180deg, rgba(65, 72, 77, 0.06) 4.1667%, rgba(65, 72, 77, 0) 4.1667%), linear-gradient(90deg, rgb(12, 16, 20) 0%, rgb(12, 16, 20) 100%)" }} />
                <div className="flex-[1_0_0] h-full min-w-px opacity-85 relative" data-node-id="43:940" data-name="AB6AXuC0WWrfhZhH_GdSATlFUl2SOJjIjlFb_4-goroS2-91SO8FRMeS1rfxaS1xwNquOwg04FQJVKFxXePik4X7QitLnfyzI1jrvhGh_kREv7a7pSuso2E1-UVR026Rpg70Nws_SOpauxWzqwpLpY9xsPU_yT1odWP4naJredsdTSZHd-BMXOstu79y_ilHHLaQjmS40QPyjd64ppmOI8MEj2t_fQG7zVbwuTQNwFxnQ60C">
                  <div className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 overflow-hidden pointer-events-none">
                    <img alt="" className="absolute h-full left-[-18.69%] max-w-none top-0 w-[137.38%]" src={imgAb6AXuC0WWrfhZhHGdSaTlFUl2SoJjIjlFb4GoroS291So8FrMeS1RfxaS1XwNquOwg04FqjvkFxXePik4X7QitLnfyzI1JrvhGhKREv7A7PSuso2E1Uvr026Rpg70NwsSOpauxWzqwpLpY9XsPuYT1OdWp4NaJredsdTszHdBmxOstu79YIlHhLaQjmS40QPyjd64PpmOi8MEj2TFQg7ZVbwuTqNwFxnQ60C} />
                  </div>
                </div>
                <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                  <div className="absolute bg-[rgba(31,86,115,0.4)] border-[rgba(31,86,115,0.6)] border-dashed border-r bottom-0 left-[197.86px] top-0 w-px" data-node-id="43:942" data-name="Vertical Divider" />
                  <div className="absolute bg-[rgba(31,86,115,0.4)] border-[rgba(31,86,115,0.6)] border-b border-dashed h-px left-0 right-0 top-[156.19px]" data-node-id="43:943" data-name="Horizontal Divider" />
                  <div className="absolute bg-[rgba(185,63,41,0.2)] border-2 border-[#b93f29] border-solid h-[48px] left-[172.67px] rounded-[9999px] top-[140.03px] w-[56px]" data-node-id="43:944" data-name="Overlay+Border" />
                  <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] left-[177.17px] not-italic text-[9px] text-[rgba(193,199,206,0.7)] top-[17px] whitespace-nowrap" data-node-id="43:945">
                    <p className="leading-[22px]">S</p>
                  </div>
                  <div className="absolute bottom-[6px] content-stretch flex flex-col items-start left-[177.17px] w-[5.41px]" data-node-id="43:946" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[9px] text-[rgba(193,199,206,0.7)] whitespace-nowrap" data-node-id="43:947">
                      <p className="leading-[22px]">I</p>
                    </div>
                  </div>
                  <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] left-[6px] not-italic text-[9px] text-[rgba(193,199,206,0.7)] top-[134.65px] whitespace-nowrap" data-node-id="43:948">
                    <p className="leading-[22px]">A</p>
                  </div>
                  <div className="absolute content-stretch flex flex-col h-[22px] items-start right-[6px] top-[123.65px]" data-node-id="43:949" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[9px] text-[rgba(193,199,206,0.7)] whitespace-nowrap" data-node-id="43:950">
                      <p className="leading-[22px]">P</p>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)]" />
              </div>
            </div>
            <div className="backdrop-blur-[12px] bg-[rgba(255,255,255,0.92)] border border-[rgba(193,199,206,0.3)] border-solid col-2 h-[355.31px] justify-self-stretch relative rounded-[12px] row-2 shrink-0" data-node-id="43:951" data-name="3. CORONAL VIEW (Frontal Plane)">
              <div className="absolute inset-[-1px] pointer-events-none rounded-[12px] shadow-[0px_12px_32px_-4px_rgba(30,37,43,0.06)]" data-node-id="43:952" data-name="3. CORONAL VIEW (Frontal Plane):shadow">
                <div aria-hidden className="absolute bg-[rgba(255,255,255,0)] inset-0 rounded-[12px]" />
                <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_1px_0px_1px_rgba(255,255,255,0.9)]" />
              </div>
              <div className="absolute content-stretch flex flex-col items-start left-[16px] pb-[8px] right-[16px] top-[16px]" data-node-id="43:953" data-name="Margin">
                <div className="content-stretch flex items-center justify-between relative shrink-0 w-full" data-node-id="43:954" data-name="Container">
                  <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-node-id="43:955" data-name="Container">
                    <div className="bg-[#3b6e8c] content-stretch flex flex-col items-start px-[8px] py-[2px] relative rounded-[4px] shrink-0" data-node-id="43:956" data-name="Background">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[10px] text-white tracking-[0.4px] whitespace-nowrap" data-node-id="43:957">
                        <p className="leading-[14px]">CORONAL (Y)</p>
                      </div>
                    </div>
                    <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:958" data-name="Container">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:959">
                        <p className="leading-[14px]">Frontal Cut</p>
                      </div>
                    </div>
                  </div>
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:960" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:961">
                      <p className="leading-[14px]">Slice 124/256</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute content-stretch flex flex-col items-start left-[16px] pt-[10px] right-[16px] top-[313.31px]" data-node-id="43:962" data-name="Mini slider:margin">
                <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full" data-node-id="43:963" data-name="Mini slider">
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:964" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:965">
                      <p className="leading-[14px]">Y:</p>
                    </div>
                  </div>
                  <div className="bg-[#dce3eb] flex-[1_0_0] h-[4px] min-w-px relative rounded-[4px]" data-node-id="43:966" data-name="Input">
                    <div className="absolute content-stretch flex items-center left-0 right-0 top-[-6px]" data-node-id="43:967" data-name="Container">
                      <div className="flex-[1_0_0] h-[16px] min-w-px relative" data-node-id="43:968" data-name="Container" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute aspect-[4/3] border border-[rgba(193,199,206,0.2)] border-solid content-stretch flex items-center justify-center left-[16px] overflow-clip p-px right-[16px] rounded-[8px] top-[42px]" data-node-id="43:969" data-name="Background+Border+Shadow">
                <div aria-hidden className="absolute inset-0 pointer-events-none rounded-[8px]" style={{ backgroundImage: "linear-gradient(90deg, rgba(65, 72, 77, 0.06) 4.1667%, rgba(65, 72, 77, 0) 4.1667%), linear-gradient(180deg, rgba(65, 72, 77, 0.06) 4.1667%, rgba(65, 72, 77, 0) 4.1667%), linear-gradient(90deg, rgb(12, 16, 20) 0%, rgb(12, 16, 20) 100%)" }} />
                <div className="flex-[1_0_0] h-full min-w-px opacity-85 relative" data-node-id="43:970" data-name="AB6AXuDCN0TtdX7dlk3joRhoFGhFvODg-8wWcWjva8t-RHa0E20XkhszevtANbQlabzamiNINPYZG3kWasRiKaXnsD9Y2LQCBt7EnK7FE_HsdaXsK63ieIPLDBG2-cEdSFA0QqbDR97neByrxeUNuc-m1H3vcVJ6Snj2ThKt78YSbCQU2auLwJWZCBOg31qeYsMX61Jnahqhn_7bKp1VzcCFMVkptUMGG5xn5Nf3rFz4_DVC">
                  <div className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 overflow-hidden pointer-events-none">
                    <img alt="" className="absolute h-full left-[-18.69%] max-w-none top-0 w-[137.38%]" src={imgAb6AXuDcn0TtdX7Dlk3JoRhoFGhFvODg8WWcWjva8TRHa0E20XkhszevtANbQlabzamiNinpyzg3KWasRiKaXnsD9Y2LqcBt7EnK7FeHsdaXsK63IeIpldbg2CEdSfa0QqbDr97NeByrxeUNucM1H3VcVj6Snj2ThKt78YSbCqu2AuLwJwzcbOg31QeYsMx61Jnahqhn7BKp1VzcCfmVkptUmgg5Xn5Nf3RFz4Dvc} />
                  </div>
                </div>
                <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                  <div className="absolute bg-[rgba(31,86,115,0.4)] border-[rgba(31,86,115,0.6)] border-dashed border-r bottom-0 left-[223.03px] top-0 w-px" data-node-id="43:972" data-name="Vertical Divider" />
                  <div className="absolute bg-[rgba(31,86,115,0.4)] border-[rgba(31,86,115,0.6)] border-b border-dashed h-px left-0 right-0 top-[145.42px]" data-node-id="43:973" data-name="Horizontal Divider" />
                  <div className="absolute bg-[rgba(185,63,41,0.2)] border-2 border-[#b93f29] border-solid h-[48px] left-[201.45px] rounded-[9999px] top-[129.26px] w-[56px]" data-node-id="43:974" data-name="Overlay+Border" />
                  <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] left-[177.17px] not-italic text-[9px] text-[rgba(193,199,206,0.7)] top-[17px] whitespace-nowrap" data-node-id="43:975">
                    <p className="leading-[22px]">S</p>
                  </div>
                  <div className="absolute bottom-[6px] content-stretch flex flex-col items-start left-[177.17px] w-[5.41px]" data-node-id="43:976" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[9px] text-[rgba(193,199,206,0.7)] whitespace-nowrap" data-node-id="43:977">
                      <p className="leading-[22px]">I</p>
                    </div>
                  </div>
                  <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] left-[6px] not-italic text-[9px] text-[rgba(193,199,206,0.7)] top-[134.65px] whitespace-nowrap" data-node-id="43:978">
                    <p className="leading-[22px]">R</p>
                  </div>
                  <div className="absolute content-stretch flex flex-col h-[22px] items-start right-[6px] top-[123.65px]" data-node-id="43:979" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[9px] text-[rgba(193,199,206,0.7)] whitespace-nowrap" data-node-id="43:980">
                      <p className="leading-[22px]">L</p>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)]" />
              </div>
            </div>
          </div>
          <div className="bg-[#edf4fd] border border-[rgba(193,199,206,0.3)] border-solid content-stretch flex items-center justify-between p-[13px] relative rounded-[12px] shrink-0 w-full" data-node-id="43:981" data-name="Quick Inspection Tool Strip">
            <div className="relative shrink-0" data-node-id="43:982" data-name="Container">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center relative size-full">
                <div className="bg-white border border-[rgba(193,199,206,0.4)] border-solid content-stretch flex gap-[6px] items-center px-[13px] py-[7px] relative rounded-[8px] shrink-0" data-node-id="43:983" data-name="Button">
                  <div className="h-[8px] relative shrink-0 w-[13.333px]" data-node-id="43:984" data-name="Container">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer4} />
                  </div>
                  <div className="relative shrink-0" data-node-id="43:986" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center relative size-full">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] text-center tracking-[0.4px] whitespace-nowrap" data-node-id="43:987">
                        <p className="leading-[14px]">Electronic Caliper</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-[rgba(193,199,206,0.4)] border-solid content-stretch flex gap-[6px] items-center px-[13px] py-[7px] relative rounded-[8px] shrink-0" data-node-id="43:988" data-name="Button">
                  <div className="relative shrink-0 size-[15.067px]" data-node-id="43:989" data-name="Container">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer5} />
                  </div>
                  <div className="relative shrink-0" data-node-id="43:991" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center relative size-full">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] text-center tracking-[0.4px] whitespace-nowrap" data-node-id="43:992">
                        <p className="leading-[14px]">Contrast / Gamma</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-[rgba(193,199,206,0.4)] border-solid content-stretch flex gap-[6px] items-center px-[13px] py-[7px] relative rounded-[8px] shrink-0" data-node-id="43:993" data-name="Button">
                  <div className="h-[12.7px] relative shrink-0 w-[12px]" data-node-id="43:994" data-name="Container">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer6} />
                  </div>
                  <div className="relative shrink-0" data-node-id="43:996" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center relative size-full">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] text-center tracking-[0.4px] whitespace-nowrap" data-node-id="43:997">
                        <p className="leading-[14px]">Mask Overlay: 80%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative shrink-0" data-node-id="43:998" data-name="Container">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[4px] items-center relative size-full">
                <div className="relative shrink-0 size-[12.5px]" data-node-id="43:999" data-name="Container">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer7} />
                </div>
                <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:1001">
                  <p className="leading-[14px]">3-Axis Triangulation Locked</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-[10/span_3] content-stretch flex flex-col gap-[20px] items-start justify-self-stretch relative row-1 self-start shrink-0" data-node-id="43:1002" data-name="Section - RIGHT COLUMN: AI Volumetric Segmentation Analysis Card & Primary 3D CTA (3 cols)">
          <div className="backdrop-blur-[9px] bg-[rgba(251,249,245,0.86)] border border-[rgba(193,199,206,0.3)] border-solid content-stretch flex flex-col gap-[16px] items-start p-[21px] relative rounded-[12px] shrink-0 w-full" data-node-id="43:1003" data-name="AI Segmentation Analysis Report">
            <div className="absolute inset-[-1px] pointer-events-none rounded-[12px] shadow-[0px_4px_20px_-2px_rgba(30,37,43,0.04)]" data-node-id="43:1004" data-name="AI Segmentation Analysis Report:shadow">
              <div aria-hidden className="absolute bg-[rgba(255,255,255,0)] bg-clip-padding border-0 border-[transparent] border-solid inset-0 rounded-[12px]" />
              <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_1px_0px_1px_rgba(255,255,255,0.8)]" />
            </div>
            <div className="relative shrink-0 w-full" data-node-id="43:1005" data-name="Header & Badges">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[10px] items-start relative size-full">
                <div className="content-stretch flex items-center justify-between relative shrink-0 w-full" data-node-id="43:1006" data-name="Container">
                  <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-node-id="43:1007" data-name="Container">
                    <div className="bg-[#38684f] relative rounded-[9999px] shrink-0 size-[10px]" data-node-id="43:1008" data-name="Background" />
                    <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:1009" data-name="Container">
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[16px] whitespace-nowrap" data-node-id="43:1010">
                        <p className="leading-[24px]">AI Volumetric Analysis</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#baeecf] content-stretch flex flex-col items-start px-[8px] py-[2px] relative rounded-[4px] shrink-0" data-node-id="43:1011" data-name="Background">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#1f4f38] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:1012">
                      <p className="leading-[14px]">Dice: 0.94</p>
                    </div>
                  </div>
                </div>
                <div className="content-stretch flex gap-[6px] items-start relative shrink-0 w-full" data-node-id="43:1013" data-name="Container">
                  <div className="bg-[#e2e9f1] border border-[rgba(193,199,206,0.3)] border-solid content-stretch flex flex-col items-start px-[9px] py-[3px] relative rounded-[9999px] self-stretch shrink-0" data-node-id="43:1014" data-name="Background+Border">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:1015">
                      <p className="leading-[14px]">Prototype Placement</p>
                    </div>
                  </div>
                  <div className="bg-[#ffdad3] border border-[rgba(185,63,41,0.2)] border-solid content-stretch flex flex-col items-start px-[9px] py-[3px] relative rounded-[9999px] self-stretch shrink-0" data-node-id="43:1016" data-name="Background+Border">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#8a1c0a] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:1017">
                      <p className="leading-[14px]">Simulated Clinical Data</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-[rgba(193,199,206,0.2)] border-solid border-t relative shrink-0 w-full" data-node-id="43:1018" data-name="Pathology Metric Breakdown">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[12px] items-start pt-[9px] relative size-full">
                <div className="bg-white border border-[rgba(193,199,206,0.2)] border-solid relative rounded-[8px] shrink-0 w-full" data-node-id="43:1019" data-name="Background+Border">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[2px] items-start p-[13px] relative size-full">
                    <div className="relative shrink-0 w-full" data-node-id="43:1020" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.5px] uppercase w-full" data-node-id="43:1021">
                          <p className="leading-[14px]">TUMOR MODEL</p>
                        </div>
                      </div>
                    </div>
                    <div className="relative shrink-0 w-full" data-node-id="43:1022" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center relative size-full">
                        <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-w-px relative" data-node-id="43:1023" data-name="Container">
                          <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#b93f29] text-[18px] tracking-[-0.09px] w-full" data-node-id="43:1024">
                            <p className="leading-[26px]">Glioblastoma Multiforme</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="relative shrink-0 w-full" data-node-id="43:1025" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] tracking-[0.4px] w-full" data-node-id="43:1026">
                          <p className="leading-[14px]">(Simulated Grade IV Astrocytoma)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative shrink-0 w-full" data-node-id="43:1027" data-name="Container">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-start justify-center relative size-full">
                    <div className="bg-white border border-[rgba(193,199,206,0.2)] border-solid flex-[1_0_0] h-[62px] min-w-px relative rounded-[8px]" data-node-id="43:1028" data-name="Background+Border">
                      <div className="absolute content-stretch flex flex-col items-start left-[12px] right-[11.99px] top-[12px]" data-node-id="43:1029" data-name="Container">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:1030">
                          <p className="leading-[14px]">Estimated Volume</p>
                        </div>
                      </div>
                      <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] left-[12px] text-[#151c22] text-[14px] top-[36.5px] whitespace-nowrap" data-node-id="43:1031">
                        <p className="leading-[22px]">{`14.8 `}</p>
                      </div>
                      <div className="-translate-y-1/2 [word-break:break-word] absolute flex flex-col font-['Manrope:Regular'] font-normal justify-center leading-[0] left-[42px] text-[#71787e] text-[12px] top-[37.5px] whitespace-nowrap" data-node-id="43:1032">
                        <p className="leading-[18px]">cm³</p>
                      </div>
                    </div>
                    <div className="bg-white border border-[rgba(193,199,206,0.2)] border-solid content-stretch flex flex-[1_0_0] flex-col items-start min-w-px p-[13px] relative rounded-[8px]" data-node-id="43:1033" data-name="Background+Border">
                      <div className="mb-[-0.5px] relative shrink-0 w-full" data-node-id="43:1034" data-name="Container">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                          <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] w-full" data-node-id="43:1035">
                            <p className="leading-[14px]">Confidence</p>
                          </div>
                        </div>
                      </div>
                      <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#38684f] text-[14px] whitespace-nowrap" data-node-id="43:1036">
                        <p className="leading-[22px]">96.2%</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-[rgba(193,199,206,0.2)] border-solid relative rounded-[8px] shrink-0 w-full" data-node-id="43:1037" data-name="Background+Border">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start p-[13px] relative size-full">
                    <div className="relative shrink-0 w-full" data-node-id="43:1038" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] w-full" data-node-id="43:1039">
                          <p className="leading-[14px]">Approximate Dimensions</p>
                        </div>
                      </div>
                    </div>
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[16px] whitespace-nowrap" data-node-id="43:1040">
                      <p className="leading-[24px]">3.2 × 2.8 × 2.4 cm</p>
                    </div>
                    <div className="relative shrink-0 w-full" data-node-id="43:1041" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pt-[2px] relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] w-full" data-node-id="43:1042">
                          <p className="leading-[14px]">Sagittal × Coronal × Axial extents</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-[rgba(193,199,206,0.2)] border-solid relative rounded-[8px] shrink-0 w-full" data-node-id="43:1043" data-name="Background+Border">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[2px] items-start p-[13px] relative size-full">
                    <div className="relative shrink-0 w-full" data-node-id="43:1044" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] w-full" data-node-id="43:1045">
                          <p className="leading-[14px]">Anatomical Location</p>
                        </div>
                      </div>
                    </div>
                    <div className="relative shrink-0 w-full" data-node-id="43:1046" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[14px] w-full" data-node-id="43:1047">
                          <p className="leading-[22px]">Right Temporal Lobe</p>
                        </div>
                      </div>
                    </div>
                    <div className="relative shrink-0 w-full" data-node-id="43:1048" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[6px] items-center pt-[2px] relative size-full">
                        <div className="relative shrink-0 size-[12px]" data-node-id="43:1049" data-name="Container">
                          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer8} />
                        </div>
                        <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:1051" data-name="Container">
                          <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#b93f29] text-[12px] whitespace-nowrap" data-node-id="43:1052">
                            <p className="leading-[18px]">Adjacent to Hippocampus (6.2mm margin)</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-[#edf4fd] border border-[rgba(193,199,206,0.3)] border-solid relative rounded-[8px] shrink-0 w-full" data-node-id="43:1053" data-name="Processing Status Bar">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[4px] items-start p-[13px] relative size-full">
                    <div className="relative shrink-0 w-full" data-node-id="43:1054" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between pb-[2px] relative size-full">
                        <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:1055" data-name="Container">
                          <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#151c22] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:1056">
                            <p className="leading-[14px]">Segmentation Pipeline</p>
                          </div>
                        </div>
                        <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:1057" data-name="Container">
                          <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#38684f] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:1058">
                            <p className="leading-[14px]">Completed</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-[#dce3eb] h-[8px] relative rounded-[9999px] shrink-0 w-full" data-node-id="43:1059" data-name="Background">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-clip relative rounded-[inherit] size-full">
                        <div className="bg-[#38684f] h-[8px] relative rounded-[9999px] shrink-0 w-full" data-node-id="43:1060" data-name="Background" />
                      </div>
                    </div>
                    <div className="relative shrink-0 w-full" data-node-id="43:1061" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between relative size-full">
                        <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:1062" data-name="Container">
                          <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[#71787e] text-[10px] whitespace-nowrap" data-node-id="43:1063">
                            <p className="leading-[22px]">UNet-3D Transformer</p>
                          </div>
                        </div>
                        <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:1064" data-name="Container">
                          <div className="[word-break:break-word] flex flex-col font-['Liberation_Mono:Regular'] justify-center leading-[0] not-italic relative shrink-0 text-[#71787e] text-[10px] whitespace-nowrap" data-node-id="43:1065">
                            <p className="leading-[22px]">Loss: 0.038</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="backdrop-blur-[12px] bg-[rgba(255,255,255,0.92)] border border-[rgba(31,86,115,0.2)] border-solid content-stretch flex flex-col gap-[12px] items-start p-[21px] relative rounded-[12px] shrink-0 w-full" data-node-id="43:1066" data-name="ACTION CONTROL DECK: Next Step to 3D Viewport">
            <div className="absolute bg-[rgba(255,255,255,0)] inset-[-1px] rounded-[12px] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)]" data-node-id="43:1067" data-name="ACTION CONTROL DECK: Next Step to 3D Viewport:shadow" />
            <div className="relative shrink-0 w-full" data-node-id="43:1068" data-name="Container">
              <div className="bg-clip-padding border-0 