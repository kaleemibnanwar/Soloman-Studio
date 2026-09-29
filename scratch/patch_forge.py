import re

with open('forge.config.ts', 'r') as f:
    content = f.read()

# Replace the makers array to conditionally include makers
old_makers = """  makers: [
    new MakerSquirrel(
      // @ts-expect-error - incorrect types exported by MakerSquirrel
      isWindowsSigningEnabled
        ? {
            windowsSign,
            iconUrl:
              "https://raw.githubusercontent.com/octopusStudio-sh/octopusStudio/main/assets/icon/logo.ico",
            setupIcon: "./assets/icon/logo.ico",
          }
        : {
            iconUrl:
              "https://raw.githubusercontent.com/octopusStudio-sh/octopusStudio/main/assets/icon/logo.ico",
            setupIcon: "./assets/icon/logo.ico",
          },
    ),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({
      options: {
        mimeType: ["x-scheme-handler/octopusStudio"],
        icon: "./assets/icon/logo.png",
      },
    }),
    new MakerDeb({
      options: {
        mimeType: ["x-scheme-handler/octopusStudio"],
        icon: "./assets/icon/logo.png",
      },
    }),
    new MakerAppImage({
      icon: "./assets/icon/logo.png",
    }),
  ],"""

new_makers = """  makers: (process.env.MAKE_TARGET === 'deb') ? [
    new MakerDeb({
      options: {
        mimeType: ["x-scheme-handler/octopusStudio"],
        icon: "./assets/icon/logo.png",
      },
    }),
  ] : [
    new MakerSquirrel(
      // @ts-expect-error - incorrect types exported by MakerSquirrel
      isWindowsSigningEnabled
        ? {
            windowsSign,
            iconUrl:
              "https://raw.githubusercontent.com/octopusStudio-sh/octopusStudio/main/assets/icon/logo.ico",
            setupIcon: "./assets/icon/logo.ico",
          }
        : {
            iconUrl:
              "https://raw.githubusercontent.com/octopusStudio-sh/octopusStudio/main/assets/icon/logo.ico",
            setupIcon: "./assets/icon/logo.ico",
          },
    ),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({
      options: {
        mimeType: ["x-scheme-handler/octopusStudio"],
        icon: "./assets/icon/logo.png",
      },
    }),
    new MakerDeb({
      options: {
        mimeType: ["x-scheme-handler/octopusStudio"],
        icon: "./assets/icon/logo.png",
      },
    }),
    new MakerAppImage({
      icon: "./assets/icon/logo.png",
    }),
  ],"""

content = content.replace(old_makers, new_makers)
with open('forge.config.ts', 'w') as f:
    f.write(content)
