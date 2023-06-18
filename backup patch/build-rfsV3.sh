######################################################################
#  @author <a href="mailto:nskumar278@gmail.com.com">nskumar278</a>  #
######################################################################

set -e
source constants.sh

# working directory
TOOLS=$PWD
WORK=$PWD/tmp
BUILD_DIR=$WORK/build
RES_DIR=$WORK/prev

# build directory
CUR_RFS_DIR=$BUILD_DIR/rfs

# resource directory
SQ_RES_DIR=$RES_DIR/squash
TGZ_RES_DIR=$RES_DIR/tgz

# export directory
EXPORTS_DIR=$WORK/exports

# files
TGZ=firmware.tgz

fetch_prev_tgz () {
    cd $TOOLS
    local prev_rfs_version=$1

    echo "Previous rfs version: $prev_rfs_version"
    
    if [ "$prev_rfs_version" = "null" ]; then
        echo "previous hub version not found exiting..."
        exit 1
    fi

    PREV_TGZ_FILE=`$TOOLS/s3 ls rfs/tgz/ | awk -F ' ' '{print $4}' | grep ^rfs-$prev_rfs_version-.*.tgz$`
    local no_of_files=`echo $PREV_TGZ_FILE | wc -w`

    if [ "$no_of_files" != "1" ]; then
        echo "Exactly one tgz file not present. Exiting..."
        exit 1
    fi

    rm -rf $CUR_RFS_DIR
    mkdir -p $CUR_RFS_DIR
    $TOOLS/s3 cp_from_s3 rfs/tgz/$PREV_TGZ_FILE $CUR_RFS_DIR
}

create_patch () {
    PREV_VERSION=$1

    fetch_prev_tgz $PREV_VERSION

    local curr_tgz_file=rfs-$VERSION-$MD5_SUM.tgz
    local prev_md5_sum=`echo $PREV_TGZ_FILE | cut -d '-' -f 3 | cut -d '.' -f 1`
    local curr_md5_sum=$MD5_SUM

    echo "Creating patch for hub"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         
    echo "From: $PREV_TGZ_FILE"
    echo "To: $curr_tgz_file"

    mkdir -p $CUR_RFS_DIR/prevRfs $CUR_RFS_DIR/currRfs

    tar xzf $CUR_RFS_DIR/$PREV_TGZ_FILE -C $CUR_RFS_DIR/prevRfs
    tar xzf $EXPORTS_DIR/$curr_tgz_file -C $CUR_RFS_DIR/currRfs
    
    bsdiff $CUR_RFS_DIR/prevRfs/*.squash $CUR_RFS_DIR/currRfs/*.squash rfs.patch

    mv -v rfs.patch rfs_patch-$prev_md5_sum-$curr_md5_sum
    mv -v rfs_patch-$prev_md5_sum-$curr_md5_sum $EXPORTS_DIR/

    echo "Creating reverse patch for hub"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         
    echo "From: $curr_tgz_file"
    echo "To: $PREV_TGZ_FILE"

    bsdiff $CUR_RFS_DIR/currRfs/*.squash $CUR_RFS_DIR/prevRfs/*.squash rfs_rev.patch

    mv -v rfs_rev.patch rfs_patch-$curr_md5_sum-$prev_md5_sum
    mv -v rfs_patch-$curr_md5_sum-$prev_md5_sum $EXPORTS_DIR/
}

get_prev_rfs () {
    PATCH_LIST=($($TOOLS/s3 ls rfs/tgz/rfs-${STACK:1:2} | sort -k1,2 -r | awk '/ rfs-'"${STACK:1:2}"'([^ ])*.tgz$/ { print $4 }'))

    if [ -n "$PATCH_BUILD" ] && [[ "$PATCH_BUILD" =~ ^[0-9]+$ ]]; then
        # PATCH_LIST=("${PATCH_LIST[@]:0:$PATCH_BUILD}")
        PATCH_LIST=("3.0.10" "3.0.11")
    fi

    echo "Building patch....."
    
    for file in "${PATCH_LIST[@]}"; do
        create_patch $(echo $file | cut -d '-' -f 2) 
    done

    echo "Done Building patch."

    rm -rf $BUILD_DIR/
}

get_rfs_squash_file () {
    local no_of_files=`ls $CUR_RFS_DIR/rfs-v$VERSION-* | wc -l`

    if [ "$no_of_files" != "1" ]; then
        echo "Exactly one tgz file not present. Exiting..."
        exit 1
    fi

    local squash_file=`ls $CUR_RFS_DIR/rfs-v$VERSION-*`
    echo $squash_file
}

start_build () {
    mkdir -p $EXPORTS_DIR $CUR_RFS_DIR

    local rfs_file_path=`get_rfs_squash_file $VERSION`
    local rfs_file=`echo $rfs_file_path | rev | cut -d'/' -f 1 | rev`
    echo "RFS File = $rfs_file"

    MD5_SUM=`md5sum $rfs_file_path | cut -d' ' -f 1`

    tar -cvzf $TGZ -C $CUR_RFS_DIR $rfs_file
    mv -v $TGZ $EXPORTS_DIR/rfs-$VERSION-$MD5_SUM.tgz

    get_prev_rfs

    ls $EXPORTS_DIR
}


VERSION=$1
STACK=$2
PATCH_BUILD=$3

# starting point of script
start_build