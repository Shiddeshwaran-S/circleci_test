/* eslint-disable max-len */
/* eslint-disable no-useless-escape */
const fs = require('fs');
const childProcess = require('child_process');
const crypto = require('crypto');

const VERSION = process.argv[2];
const STACK = process.argv[3].charAt(1);
const PATCH_COUNT = process.argv[4];

const PWD = childProcess.execSync('pwd').toString().trim();

//  working directory
const WORK_DIR = `${PWD}/tmp`;
const BUILD_DIR = `${WORK_DIR}/build`;

//  build directory
const BUILD_RFS_DIR = `${BUILD_DIR}/rfs`;
const BUILD_PATCH_DIR = `${BUILD_DIR}/patch`;
const BUILD_REV_PATCH_DIR = `${BUILD_DIR}/rev_patch`;
const BUILD_UPL_DIR = `${BUILD_DIR}/upload`;

//  resource directory
const RES_DIR = `${WORK_DIR}/prev`;
const TGZ_RES_DIR = `${RES_DIR}/tgz`;
const SQ_RES_DIR = `${RES_DIR}/squash`;

//  export directory for release
const EXP_DIR = `${WORK_DIR}/exports`;

//  s3 directory
const S3_RFS_TGZ_DIR = 'rfs/tgz';

//  files
let CUR_RFS_FILE;
let PRE_RFS_TGZ = [];

// values
let CUR_MD5_VAL;

childProcess.execSync(`mkdir -p ${BUILD_RFS_DIR} ${BUILD_PATCH_DIR} ${BUILD_REV_PATCH_DIR} ${BUILD_UPL_DIR}`);
childProcess.execSync(`mkdir -p ${TGZ_RES_DIR} ${SQ_RES_DIR}`);
childProcess.execSync(`mkdir -p ${EXP_DIR}`);

function exit(error) {
  console.log(error);
  process.exit(-1);
}

function checkS3FileCount(filePath) {
  const filePattern = `${filePath[0]}-${filePath[1]}-`;
  const fileCount = childProcess.execSync(`./s3 ls ${S3_RFS_TGZ_DIR}/${filePattern} | wc -l`);

  if (fileCount.toString() !== '1') {
    console.log('Exactly one tgz file not present. Exiting...');
    exit(1);
  }
}

function checkFileValidity(folder, file) {
  const fileCount = childProcess.execSync(`ls ${folder}/${file} | wc -l`);

  if (fileCount.toString() !== '1') {
    console.log('Exactly one tgz file not present. Exiting...');
    exit(1);
  }
}

function exportFiles() {
  console.log('Exproting patch files');

  childProcess.execSync(`mv ${BUILD_PATCH_DIR}/* ${EXP_DIR}/`);
  childProcess.execSync(`mv ${BUILD_REV_PATCH_DIR}/* ${EXP_DIR}/`);
  childProcess.execSync(`mv ${BUILD_UPL_DIR}/* ${EXP_DIR}/`);

  console.log('Export completed...');
}

function buildPatch() {
  let prevMD5Sum;

  const prevSquashFiles = childProcess.execSync(`ls ${SQ_RES_DIR} | awk '/rfs-v${STACK}.[0-9].([0-9])*(.([0-9])*)?-/'`).toString().trim().split('\n');

  prevSquashFiles.forEach((prevSquashFile) => {
    prevMD5Sum = calculateMD5(`${SQ_RES_DIR}/${prevSquashFile}`);
    console.log('File: ', prevSquashFile, ' MD5: ', prevMD5Sum);
    childProcess.execSync(`bsdiff ${SQ_RES_DIR}/${prevSquashFile} ${BUILD_RFS_DIR}/${CUR_RFS_FILE} ${BUILD_PATCH_DIR}/rfs_patch-${prevMD5Sum}-${CUR_MD5_VAL}`);
    childProcess.execSync(`bsdiff ${BUILD_RFS_DIR}/${CUR_RFS_FILE} ${SQ_RES_DIR}/${prevSquashFile} ${BUILD_REV_PATCH_DIR}/rfs_patch-${CUR_MD5_VAL}-${prevMD5Sum}`);
    console.log('Patch and reverse patch updated.....');
  });

  exportFiles();
}

function getPatchAllVersions() {
  PRE_RFS_TGZ = childProcess.execSync(`./s3 ls ${S3_RFS_TGZ_DIR}/ | awk '/ rfs-${STACK}.([^\s])*.tgz/ { print $4 }'`).toString().trim().split('\n');

  PRE_RFS_TGZ.forEach((value) => {
    checkS3FileCount(value.split('-'));
    childProcess.execSync(`./s3 cp_from_s3 ${S3_RFS_TGZ_DIR}/${value} ${TGZ_RES_DIR}/`);
  });

  console.log('Previous RFS tgz downloaded..');

  PRE_RFS_TGZ.forEach((value) => {
    childProcess.execSync(`tar -C ${SQ_RES_DIR}/ -xf ${TGZ_RES_DIR}/${value}`);
  });

  console.log('Previous RFS squash Extracted..');

  buildPatch();
}

function getPatchVersionsLimitted() {
  PRE_RFS_TGZ = childProcess.execSync(`./s3 ls ${S3_RFS_TGZ_DIR}/ | sort -k1,2 -r | awk '/ rfs-${STACK}.([^\s])*.tgz/ { print $4 }'`).toString().trim().split('\n');

  PRE_RFS_TGZ = PRE_RFS_TGZ.slice(0, PATCH_COUNT);

  PRE_RFS_TGZ.forEach((value) => {
    childProcess.execSync(`./s3 cp_from_s3 ${S3_RFS_TGZ_DIR}/${value} ${TGZ_RES_DIR}/`);
  });

  console.log('Previous RFS tgz downloaded..');

  PRE_RFS_TGZ.forEach((value) => {
    childProcess.execSync(`tar -C ${SQ_RES_DIR}/ -xf ${TGZ_RES_DIR}/${value}`);
  });

  console.log('Previous RFS squash Extracted..');

  buildPatch();
}

function calculateMD5(filePath) {
  const fileData = fs.readFileSync(filePath);
  const hash = crypto.createHash('md5').update(fileData).digest('hex');
  return hash;
}

function main() {
  try {
    const files = fs.readdirSync(BUILD_RFS_DIR);
    // eslint-disable-next-line prefer-destructuring
    CUR_RFS_FILE = files[0];
  } catch (error) {
    exit(error);
  }

  checkFileValidity(BUILD_RFS_DIR, `rfs-v${VERSION}-*`);

  CUR_MD5_VAL = calculateMD5(`${BUILD_RFS_DIR}/${CUR_RFS_FILE}`);

  childProcess.execSync(`tar -cvzf ${BUILD_UPL_DIR}/rfs-${VERSION}-${CUR_MD5_VAL}.tgz -C ${BUILD_RFS_DIR} ${CUR_RFS_FILE}`);

  console.log('RFS tgz created..');

  if (PATCH_COUNT === 'all') {
    getPatchAllVersions();
  } else if (PATCH_COUNT > 0) {
    getPatchVersionsLimitted();
  }

  console.log(childProcess.execSync(`ls ${BUILD_UPL_DIR}`).toString().trim());
}

main();
