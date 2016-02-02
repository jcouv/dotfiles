
# Based off https://generally.wordpress.com/2006/11/28/building-visual-studio-solutions-using-msbuild-in-cygwin/

msdev='c:\Program Files (x86)\Microsoft Visual Studio 14.0'
msbuild='c:\Program Files (x86)\MSBuild\14.0\bin'

export VSINSTALLDIR=$msdev

export VCINSTALLDIR=$msdev\\VC
export FrameworkDir='c:\WINDOWS\Microsoft.NET\Framework'
export FrameworkVersion=v4.0.30319
#export FrameworkSDKDir=$msdev\\SDK\\v2.0

# Root of Visual Studio IDE installed files.
export DevEnvDir=$msdev\\Common7\\IDE

VCINSTALLDIR_UNIX=$(cygpath --unix "$VCINSTALLDIR")
DevEnvDir_UNIX=$(cygpath --unix "$DevEnvDir")

FrameworkDir_UNIX=$(cygpath --unix "$FrameworkDir")
#FrameworkSDKDir_UNIX=$(cygpath --unix "$FrameworkSDKDir")

MSBUILDDIR_UNIX=$(cygpath --unix "$msbuild")
TOOLSDIR_UNIX=$(cygpath --unix "$msdev\\Common7\\Tools")

export PATH=$DevEnvDir_UNIX:$VCINSTALLDIR_UNIX/bin:$MSBUILDDIR_UNIX:$TOOLSDIR_UNIX:$TOOLSDIR_UNIX/Bin:$VCINSTALLDIR_UNIX/PlatformSDK/Bin:$FrameworkDir_UNIX/$FrameworkVersion:$VCINSTALLDIR_UNIX/VCPackages:$PATH

#export INCLUDE='$VCINSTALLDIR\\ATLMFC\\INCLUDE';'$VCINSTALLDIR\\INCLUDE';'$VCINSTALLDIR\\PlatformSDK\\include'
#export LIB='$VCINSTALLDIR\\ATLMFC\\LIB';'$VCINSTALLDIR\\LIB';'$VCINSTALLDIR\\PlatformSDK\\lib'

#export INCLUDE=$VCINSTALLDIR\\ATLMFC\\INCLUDE';'$VCINSTALLDIR\\INCLUDE';'$VCINSTALLDIR\\PlatformSDK\\include';'$FrameworkSDKDir\\include
#export LIB=$VCINSTALLDIR\\ATLMFC\\LIB';'$VCINSTALLDIR\\LIB';'$VCINSTALLDIR\\PlatformSDK\\lib';'$FrameworkSDKDir\\lib

export LIBPATH=$FrameworkDir\\$FrameworkVersion';'$VCINSTALLDIR\\ATLMFC\\LIB

unset msdev
unset msbuild
unset VCINSTALLDIR_UNIX
unset DevEnvDir_UNIX
unset FrameworkDir_UNIX
unset FrameworkSDKDir_UNIX
unset MSBUILDDIR_UNIX
unset TOOLSDIR_UNIX

alias msbuild='MSBuild.exe'

