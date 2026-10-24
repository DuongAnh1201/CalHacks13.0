const assetPathPrefix = "./assets";
const imgIcon = `${assetPathPrefix}/47363.svg`;
const imgIcon1 = `${assetPathPrefix}/3f40b.svg`;
const imgIcon2 = `${assetPathPrefix}/8682b.svg`;
const imgIcon3 = `${assetPathPrefix}/d5c9a.svg`;
const imgIcon4 = `${assetPathPrefix}/460ba.svg`;
const imgContainer = `${assetPathPrefix}/3ad0c.svg`;
const imgContainer1 = `${assetPathPrefix}/42112.svg`;
const imgContainer2 = `${assetPathPrefix}/5f73c.svg`;
const imgContainer3 = `${assetPathPrefix}/030d1.svg`;
const imgContainer4 = `${assetPathPrefix}/52b59.svg`;

export default function Component01UploadMri() {
  return (
    <div className="content-stretch flex flex-col items-start relative size-full" data-node-id="43:3" style={{ backgroundImage: "linear-gradient(90deg, rgb(246, 249, 255) 0%, rgb(246, 249, 255) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)" }} data-name="01 · Upload MRI">
      <div className="content-stretch flex flex-col gap-[28px] h-[1317px] items-center justify-center max-w-[1720px] pb-[96px] pt-[120px] px-[24px] relative shrink-0 w-full" data-node-id="43:4" data-name="Main - MAIN MULTI-PLANAR WORKSPACE CANVAS">
        <div className="content-stretch flex gap-[12px] items-center overflow-clip relative shrink-0" data-node-id="44:2" data-name="Flow Stepper">
          <div className="bg-[#e3eef4] content-stretch flex gap-[8px] items-center overflow-clip pl-[6px] pr-[14px] py-[6px] relative rounded-[999px] shrink-0" data-node-id="44:3" data-name="Step 1">
            <div className="bg-[#1f5673] content-stretch flex items-center justify-center overflow-clip relative rounded-[999px] shrink-0 size-[24px]" data-node-id="44:4" data-name="Index">
              <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[12px] text-white whitespace-nowrap" data-node-id="44:5">
                1
              </p>
            </div>
            <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#1f5673] text-[13px] whitespace-nowrap" data-node-id="44:6">
              Upload MRI
            </p>
          </div>
          <div className="bg-[#c1c7ce] h-px relative shrink-0 w-[48px]" data-node-id="44:7" data-name="Connector" />
          <div className="content-stretch flex gap-[8px] items-center overflow-clip pl-[6px] pr-[14px] py-[6px] relative rounded-[999px] shrink-0" data-node-id="44:8" data-name="Step 2">
            <div className="border border-[#c1c7ce] border-solid content-stretch flex items-center justify-center overflow-clip relative rounded-[999px] shrink-0 size-[24px]" data-node-id="44:9" data-name="Index">
              <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#71787e] text-[12px] whitespace-nowrap" data-node-id="44:10">
                2
              </p>
            </div>
            <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] relative shrink-0 text-[#71787e] text-[13px] whitespace-nowrap" data-node-id="44:11">{`Segment & review`}</p>
          </div>
          <div className="bg-[#c1c7ce] h-px relative shrink-0 w-[48px]" data-node-id="44:12" data-name="Connector" />
          <div className="content-stretch flex gap-[8px] items-center overflow-clip pl-[6px] pr-[14px] py-[6px] relative rounded-[999px] shrink-0" data-node-id="44:13" data-name="Step 3">
            <div className="border border-[#c1c7ce] border-solid content-stretch flex items-center justify-center overflow-clip relative rounded-[999px] shrink-0 size-[24px]" data-node-id="44:14" data-name="Index">
              <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#71787e] text-[12px] whitespace-nowrap" data-node-id="44:15">
                3
              </p>
            </div>
            <p className="[word-break:break-word] font-['Manrope:SemiBold'] font-semibold leading-[normal] relative shrink-0 text-[#71787e] text-[13px] whitespace-nowrap" data-node-id="44:16">
              Explore in 3D
            </p>
          </div>
        </div>
        <div className="[word-break:break-word] content-stretch flex flex-col gap-[10px] items-center leading-[normal] overflow-clip relative shrink-0 text-center" data-node-id="44:17" data-name="Heading">
          <p className="font-['Manrope:Bold'] font-bold relative shrink-0 text-[#151c22] text-[36px] whitespace-nowrap" data-node-id="44:18">
            Load an MRI study
          </p>
          <p className="font-['Manrope:Medium'] font-medium relative shrink-0 text-[#71787e] text-[15px] w-[640px]" data-node-id="44:19">
            Drop a scan to start. NeuroVision segments the tumor, opens the MRI Workspace, and lets you place it on the 3D brain.
          </p>
        </div>
        <a className="bg-[rgba(255,255,255,0.92)] border-2 border-[rgba(31,86,115,0.55)] border-dashed content-stretch cursor-pointer flex flex-col gap-[16px] items-center justify-center overflow-clip pb-[48px] pt-[56px] px-[48px] relative rounded-[16px] shrink-0 w-[880px]" data-node-id="44:20" data-name="Dropzone — Idle">
          <div className="bg-[#e3eef4] content-stretch flex items-center justify-center overflow-clip relative rounded-[999px] shrink-0 size-[72px]" data-node-id="44:21" data-name="Upload Icon">
            <div className="relative shrink-0 size-[32px]" data-node-id="44:22" data-name="Icon">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon} />
            </div>
          </div>
          <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#151c22] text-[22px] text-center whitespace-nowrap" data-node-id="44:26">{`Drag & drop MRI files here`}</p>
          <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] relative shrink-0 text-[#71787e] text-[14px] text-center whitespace-nowrap" data-node-id="44:27">
            A whole DICOM folder, a NIfTI volume, or a single 2D slice.
          </p>
          <div className="content-stretch flex gap-[12px] items-start overflow-clip pt-[8px] relative shrink-0" data-node-id="44:28" data-name="Actions">
            <div className="bg-[#1f5673] content-stretch flex gap-[8px] items-center overflow-clip px-[20px] py-[12px] relative rounded-[8px] shrink-0" data-node-id="44:29" data-name="Button — Browse files">
              <div className="relative shrink-0 size-[18px]" data-node-id="44:30" data-name="Icon">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon1} />
              </div>
              <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[14px] text-left text-white whitespace-nowrap" data-node-id="44:33">
                Browse files
              </p>
            </div>
            <div className="bg-white border border-[#c1c7ce] border-solid content-stretch flex gap-[8px] items-center overflow-clip px-[20px] py-[12px] relative rounded-[8px] shrink-0" data-node-id="44:34" data-name="Button — Choose DICOM folder">
              <div className="relative shrink-0 size-[18px]" data-node-id="44:35" data-name="Icon">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon2} />
              </div>
              <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#151c22] text-[14px] text-left whitespace-nowrap" data-node-id="44:37">
                Choose DICOM folder
              </p>
            </div>
          </div>
          <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] relative shrink-0 text-[#71787e] text-[12px] text-center whitespace-pre" data-node-id="44:38">{`Max 250 MB per study  ·  T1-weighted contrast-enhanced recommended`}</p>
        </a>
        <div className="content-stretch flex flex-col gap-[12px] items-start overflow-clip relative shrink-0 w-[880px]" data-node-id="44:47" data-name="Accepted Formats">
          <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.8px] whitespace-nowrap" data-node-id="44:48">
            ACCEPTED FILE TYPES
          </p>
          <div className="content-stretch flex gap-[20px] items-start overflow-clip relative shrink-0 w-full" data-node-id="44:49" data-name="Format Grid">
            <div className="bg-[rgba(251,249,245,0.86)] border border-[#c1c7ce] border-solid content-stretch flex flex-[1_0_0] flex-col gap-[10px] items-start min-w-px p-[16px] relative rounded-[12px] self-stretch" data-node-id="44:50" data-name="Format Card">
              <div className="content-stretch flex items-center justify-between overflow-clip relative shrink-0 w-full" data-node-id="I44:50;44:40" data-name="Top">
                <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#151c22] text-[14px] whitespace-nowrap" data-node-id="I44:50;44:41">
                  NIfTI volume
                </p>
                <div className="bg-[#e2f1e6] content-stretch flex items-start overflow-clip px-[8px] py-[2px] relative rounded-[999px] shrink-0" data-node-id="I44:50;44:42" data-name="Badge">
                  <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#2e6b47] text-[10px] whitespace-nowrap" data-node-id="I44:50;44:43">
                    3D
                  </p>
                </div>
              </div>
              <div className="bg-[#e3eef4] content-stretch flex items-start overflow-clip px-[8px] py-[4px] relative rounded-[6px] shrink-0" data-node-id="I44:50;44:44" data-name="Extension">
                <p className="[word-break:break-word] font-['Cousine:Regular'] leading-[normal] not-italic relative shrink-0 text-[#1f5673] text-[12px] whitespace-pre" data-node-id="I44:50;44:45">{`.nii  .nii.gz`}</p>
              </div>
              <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] min-w-full relative shrink-0 text-[#71787e] text-[12px] w-[min-content]" data-node-id="I44:50;44:46">
                Full 3D volume. Tumor is registered to the atlas in 3D.
              </p>
            </div>
            <div className="bg-[rgba(251,249,245,0.86)] border border-[#c1c7ce] border-solid content-stretch flex flex-[1_0_0] flex-col gap-[10px] items-start min-w-px p-[16px] relative rounded-[12px] self-stretch" data-node-id="44:58" data-name="Format Card">
              <div className="content-stretch flex items-center justify-between overflow-clip relative shrink-0 w-full" data-node-id="I44:58;44:40" data-name="Top">
                <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#151c22] text-[14px] whitespace-nowrap" data-node-id="I44:58;44:41">
                  DICOM series
                </p>
                <div className="bg-[#e2f1e6] content-stretch flex items-start overflow-clip px-[8px] py-[2px] relative rounded-[999px] shrink-0" data-node-id="I44:58;44:42" data-name="Badge">
                  <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#2e6b47] text-[10px] whitespace-nowrap" data-node-id="I44:58;44:43">
                    3D
                  </p>
                </div>
              </div>
              <div className="bg-[#e3eef4] content-stretch flex items-start overflow-clip px-[8px] py-[4px] relative rounded-[6px] shrink-0" data-node-id="I44:58;44:44" data-name="Extension">
                <p className="[word-break:break-word] font-['Cousine:Regular'] leading-[normal] not-italic relative shrink-0 text-[#1f5673] text-[12px] whitespace-pre" data-node-id="I44:58;44:45">{`.dcm  (folder)`}</p>
              </div>
              <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] min-w-full relative shrink-0 text-[#71787e] text-[12px] w-[min-content]" data-node-id="I44:58;44:46">
                Slices stacked into a volume. Patient headers stripped on device.
              </p>
            </div>
            <div className="bg-[rgba(251,249,245,0.86)] border border-[#c1c7ce] border-solid content-stretch flex flex-[1_0_0] flex-col gap-[10px] items-start min-w-px p-[16px] relative rounded-[12px] self-stretch" data-node-id="44:66" data-name="Format Card">
              <div className="content-stretch flex items-center justify-between overflow-clip relative shrink-0 w-full" data-node-id="I44:66;44:40" data-name="Top">
                <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#151c22] text-[14px] whitespace-nowrap" data-node-id="I44:66;44:41">
                  ZIP archive
                </p>
                <div className="bg-[#e2f1e6] content-stretch flex items-start overflow-clip px-[8px] py-[2px] relative rounded-[999px] shrink-0" data-node-id="I44:66;44:42" data-name="Badge">
                  <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#2e6b47] text-[10px] whitespace-nowrap" data-node-id="I44:66;44:43">
                    3D
                  </p>
                </div>
              </div>
              <div className="bg-[#e3eef4] content-stretch flex items-start overflow-clip px-[8px] py-[4px] relative rounded-[6px] shrink-0" data-node-id="I44:66;44:44" data-name="Extension">
                <p className="[word-break:break-word] font-['Cousine:Regular'] leading-[normal] not-italic relative shrink-0 text-[#1f5673] text-[12px] whitespace-nowrap" data-node-id="I44:66;44:45">
                  .zip
                </p>
              </div>
              <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] min-w-full relative shrink-0 text-[#71787e] text-[12px] w-[min-content]" data-node-id="I44:66;44:46">
                A zipped DICOM series or NIfTI file. Unpacked locally.
              </p>
            </div>
            <div className="bg-[rgba(251,249,245,0.86)] border border-[#c1c7ce] border-solid content-stretch flex flex-[1_0_0] flex-col gap-[10px] items-start min-w-px p-[16px] relative rounded-[12px] self-stretch" data-node-id="44:74" data-name="Format Card">
              <div className="content-stretch flex items-center justify-between overflow-clip relative shrink-0 w-full" data-node-id="I44:74;44:40" data-name="Top">
                <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#151c22] text-[14px] whitespace-nowrap" data-node-id="I44:74;44:41">
                  2D slice image
                </p>
                <div className="bg-[#f8ecd6] content-stretch flex items-start overflow-clip px-[8px] py-[2px] relative rounded-[999px] shrink-0" data-node-id="I44:74;44:42" data-name="Badge">
                  <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#8a5a12] text-[10px] whitespace-nowrap" data-node-id="I44:74;44:43">
                    Approx.
                  </p>
                </div>
              </div>
              <div className="bg-[#e3eef4] content-stretch flex items-start overflow-clip px-[8px] py-[4px] relative rounded-[6px] shrink-0" data-node-id="I44:74;44:44" data-name="Extension">
                <p className="[word-break:break-word] font-['Cousine:Regular'] leading-[normal] not-italic relative shrink-0 text-[#1f5673] text-[12px] whitespace-pre" data-node-id="I44:74;44:45">{`.png  .jpg`}</p>
              </div>
              <p className="[word-break:break-word] font-['Manrope:Medium'] font-medium leading-[normal] min-w-full relative shrink-0 text-[#71787e] text-[12px] w-[min-content]" data-node-id="I44:74;44:46">
                One slice. You set the depth; placement is approximate.
              </p>
            </div>
          </div>
        </div>
        <div className="content-stretch flex gap-[20px] items-start overflow-clip relative shrink-0 w-[880px]" data-node-id="44:82" data-name="Secondary Options">
          <div className="bg-[#e3eef4] border border-[rgba(31,86,115,0.6)] border-solid content-stretch flex flex-[1_0_0] gap-[14px] items-center min-w-px overflow-clip p-[16px] relative rounded-[12px]" data-node-id="44:83" data-name="Sample Scan Option">
            <div className="relative shrink-0 size-[24px]" data-node-id="44:84" data-name="Icon">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon3} />
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start leading-[normal] min-w-px overflow-clip relative" data-node-id="44:87" data-name="Copy">
              <p className="font-['Manrope:Bold'] font-bold relative shrink-0 text-[#151c22] text-[14px] whitespace-nowrap" data-node-id="44:88">
                No scan? Try the demo case
              </p>
              <p className="font-['Manrope:Medium'] font-medium min-w-full relative shrink-0 text-[#71787e] text-[12px] w-[min-content]" data-node-id="44:89">
                Sample glioblastoma, right temporal lobe. T1-weighted + contrast.
              </p>
            </div>
            <a className="bg-white border border-[#c1c7ce] border-solid content-stretch cursor-pointer flex items-start overflow-clip px-[14px] py-[8px] relative rounded-[8px] shrink-0" data-node-id="44:90" data-name="Button — Use sample">
              <p className="[word-break:break-word] font-['Manrope:Bold'] font-bold leading-[normal] relative shrink-0 text-[#151c22] text-[12px] text-left whitespace-nowrap" data-node-id="44:91">
                Use sample
              </p>
            </a>
          </div>
          <div className="bg-[rgba(251,249,245,0.86)] border border-[#c1c7ce] border-solid content-stretch flex flex-[1_0_0] gap-[14px] items-center min-w-px overflow-clip p-[16px] relative rounded-[12px]" data-node-id="44:92" data-name="Privacy Note">
            <div className="relative shrink-0 size-[24px]" data-node-id="44:93" data-name="Icon">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon4} />
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start leading-[normal] min-w-px overflow-clip relative" data-node-id="44:96" data-name="Copy">
              <p className="font-['Manrope:Bold'] font-bold relative shrink-0 text-[#151c22] text-[14px] whitespace-nowrap" data-node-id="44:97">
                Stays on this device
              </p>
              <p className="font-['Manrope:Medium'] font-medium min-w-full relative shrink-0 text-[#71787e] text-[12px] w-[min-content]" data-node-id="44:98">
                Scans are processed locally and never sent to the agent or any external API.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute backdrop-blur-[6px] bg-[rgba(255,255,255,0.8)] border border-[rgba(193,199,206,0.2)] border-solid bottom-[8px] content-stretch flex flex-col items-start left-[24px] p-px right-[24px] rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]" data-node-id="43:329" data-name="FOOTER (Shared Component: Footer)">
        <div className="relative shrink-0 w-full" data-node-id="43:330" data-name="Container">
          <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between px-[16px] py-[8px] relative size-full">
            <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-node-id="43:331" data-name="Regulatory Note & Disclaimer">
              <div className="relative shrink-0 size-[13.333px]" data-node-id="43:332" data-name="Container">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer} />
              </div>
              <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:334" data-name="Container">
                <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:335">
                  <p className="leading-[14px]">Educational visualization prototype — not for diagnosis or surgical planning.</p>
                </div>
              </div>
            </div>
            <div className="content-stretch flex gap-[20px] items-center relative shrink-0" data-node-id="43:336" data-name="Footer Anchor Links">
              <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:337" data-name="Link">
                <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:338">
                  <p className="leading-[14px]">Regulatory Note</p>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:339" data-name="Link">
                <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:340">
                  <p className="leading-[14px]">Data Accuracy</p>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:341" data-name="Link">
                <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:342">
                  <p className="leading-[14px]">Documentation</p>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:343" data-name="Link">
                <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:344">
                  <p className="leading-[14px]">Gesture Guide</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute backdrop-blur-[6px] bg-[rgba(255,255,255,0.85)] border border-[rgba(193,199,206,0.3)] border-solid content-stretch flex flex-col items-start left-[24px] p-px right-[24px] rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] top-[16px]" data-node-id="43:345" data-name="Header - TOP BAR (Shared Component: TopNavBar with active state on 'MRI Workspace')">
        <div className="relative shrink-0 w-full" data-node-id="43:346" data-name="Container">
          <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-between px-[24px] py-[12px] relative size-full">
            <div className="content-stretch flex gap-[12px] items-center relative shrink-0" data-node-id="43:347" data-name="Brand & Academic Identity">
              <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-node-id="43:348" data-name="Link">
                <div className="bg-[#3b6e8c] content-stretch drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] flex items-center justify-center relative rounded-[8px] shrink-0 size-[32px]" data-node-id="43:349" data-name="Background+Shadow">
                  <div className="relative shrink-0 size-[15px]" data-node-id="43:350" data-name="Container">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer1} />
                  </div>
                </div>
                <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="43:352" data-name="Container">
                  <div className="[word-break:break-word] flex flex-col font-['Manrope:Bold'] font-bold justify-center leading-[0] relative shrink-0 text-[#1f5673] text-[18px] tracking-[-0.09px] whitespace-nowrap" data-node-id="43:353">
                    <p className="leading-[26px]">NeuroVision</p>
                  </div>
                </div>
              </div>
              <div className="border-[rgba(193,199,206,0.4)] border-l border-solid content-stretch flex gap-[8px] items-center pl-[13px] relative shrink-0" data-node-id="43:354" data-name="VerticalBorder">
                <div className="bg-[#e2e9f1] relative rounded-[4px] shrink-0" data-node-id="43:355" data-name="Background">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start px-[8px] py-[2px] relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:356">
                      <p className="leading-[14px]">v2.4 Core</p>
                    </div>
                  </div>
                </div>
                <div className="relative shrink-0" data-node-id="43:357" data-name="Container">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#71787e] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:358">
                      <p className="leading-[14px]">DICOM Engine 4D</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="content-stretch flex gap-[32px] items-center relative shrink-0" data-node-id="43:359" data-name="Navigation Links: 'MRI Workspace' Active">
              <div className="content-stretch flex flex-col items-start px-[8px] py-[4px] relative rounded-[4px] shrink-0" data-node-id="43:360" data-name="Link">
                <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#41484d] text-[13px] tracking-[0.13px] whitespace-nowrap" data-node-id="43:361">
                  <p className="leading-[18px]">Explore</p>
                </div>
              </div>
              <div className="border-[#1f5673] border-b-2 border-solid content-stretch flex flex-col items-start pb-[4px] relative shrink-0" data-node-id="43:362" data-name="Link">
                <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#1f5673] text-[16px] whitespace-nowrap" data-node-id="43:363">
                  <p className="leading-[24px]">MRI Workspace</p>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-start px-[8px] py-[4px] relative rounded-[4px] shrink-0" data-node-id="43:364" data-name="Link">
                <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#41484d] text-[13px] tracking-[0.13px] whitespace-nowrap" data-node-id="43:365">
                  <p className="leading-[18px]">Learning Mode</p>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-start px-[8px] py-[4px] relative rounded-[4px] shrink-0" data-node-id="43:366" data-name="Link">
                <div className="[word-break:break-word] flex flex-col font-['Manrope:SemiBold'] font-semibold justify-center leading-[0] relative shrink-0 text-[#41484d] text-[13px] tracking-[0.13px] whitespace-nowrap" data-node-id="43:367">
                  <p className="leading-[18px]">Help</p>
                </div>
              </div>
            </div>
            <div className="content-stretch flex gap-[12px] items-center relative shrink-0" data-node-id="43:368" data-name="Trailing Status & Actions">
              <div className="bg-[#e8eff7] border border-[rgba(193,199,206,0.4)] border-solid content-stretch flex gap-[8px] items-center px-[11px] py-[5px] relative rounded-[9999px] shrink-0" data-node-id="43:369" data-name="Background+Border">
                <div className="bg-[#38684f] relative rounded-[9999px] shrink-0 size-[8px]" data-node-id="43:370" data-name="Background" />
                <div className="relative shrink-0" data-node-id="43:371" data-name="Container">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#41484d] text-[10px] tracking-[0.4px] whitespace-nowrap" data-node-id="43:372">
                      <p className="leading-[14px]">Webcam Active</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-[#edf4fd] border border-[rgba(193,199,206,0.4)] border-solid content-stretch flex gap-[6px] items-center px-[13px] py-[5px] relative rounded-[8px] shrink-0" data-node-id="43:373" data-name="Button">
                <div className="relative shrink-0 size-[11.25px]" data-node-id="43:374" data-name="Container">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer2} />
                </div>
                <div className="relative shrink-0" data-node-id="43:376" data-name="Container">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center relative size-full">
                    <div className="[word-break:break-word] flex flex-col font-['Manrope:Medium'] font-medium justify-center leading-[0] relative shrink-0 text-[#1f5673] text-[10px] text-center tracking-[0.4px] whitespace-nowrap" data-node-id="43:377">
                      <p className="leading-[14px]">Sensitivity: Normal</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-[rgba(193,199,206,0.3)] border-l border-solid content-stretch flex gap-[4px] items-center pl-[9px] relative shrink-0" data-node-id="43:378" data-name="VerticalBorder">
                <div className="relative rounded-[8px] shrink-0" data-node-id="43:379" data-name="Button - Help & Documentation">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center pb-[6px] pt-[8.22px] px-[6px] relative size-full">
                    <div className="relative shrink-0 size-[16.667px]" data-node-id="43:380" data-name="Container">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer3} />
                    </div>
                  </div>
                </div>
                <div className="relative rounded-[8px] shrink-0" data-node-id="43:382" data-name="Button - Investigator Profile">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center pb-[6px] pt-[8.22px] px-[6px] relative size-full">
                    <div className="relative shrink-0 size-[16.667px]" data-node-id="43:383" data-name="Container">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer4} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}