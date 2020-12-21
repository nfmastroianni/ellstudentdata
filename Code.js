function doGet(e) {
  var HTMLoutput = HtmlService.createHtmlOutput();
  var page = HtmlService.createTemplateFromFile("index")
    .evaluate()
    .getContent();
  HTMLoutput.addMetaTag("viewport", "width=device-width, initial-scale=1");
  HTMLoutput.append(page);
  return HTMLoutput;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

var props = PropertiesService.getScriptProperties().getProperties();
var id = props.oneRosterId;
var dbId = props.notesId;
var API_KEY = props.API_KEY;
var API_SECRET = props.API_SECRET;
var rosterServer = props.rosterServer;
var ss = SpreadsheetApp.openById(id);
var db = SpreadsheetApp.openById(dbId);

/**
 * Make API Request to ClassLink OneRoster API
 * @param {string} API call type
 * @param {string} ID of resource
 * @param {object} filter object for API request
 */
function oneRosterApi(type, id, filter, limit, sort) {
  var service = getService();
  var baseUrl = rosterServer;
  var apiUrl = {
    students: "students",
    student: `students/${id}`,
    studentSchedule: `students/${id}/classes`,
    users: "users",
  };
  var filterUrl = "";
  if (filter) {
    var filterUrl =
      "&filter=" + Object.keys(filter) + "%3D'" + Object.values(filter) + "'";
  }
  var limitUrl = "?limit=10000";
  if (limit) {
    var limitUrl = "?limit=" + limit;
  }
  var sortUrl = "";
  if (sort) {
    sortUrl = "&sort=" + sort + "&orderBy=asc";
  }
  var url = baseUrl + apiUrl[type] + limitUrl + filterUrl + sortUrl;
  try {
    var response = service.fetch(url);
  } catch (e) {
    return e;
  }
  var result = JSON.parse(response);
  return result;
  //  return JSON.stringify(result, null, 2);
}

/**
 * Configures the oauth1 service.
 */
function getService() {
  return (
    OAuth1.createService("OneRoster")
      // Set the consumer key and secret.
      .setConsumerKey(API_KEY)
      .setConsumerSecret(API_SECRET)

      // Manually set the token and secret to the empty string, since the API
      // uses 1-legged OAuth.
      .setAccessToken("", "")
  );
}

function authenticateUser() {
  var user = {};
  user.authenticated = false;
  user.inDb = false;
  var activeUserEmail = Session.getActiveUser().getEmail();
  user.email = activeUserEmail;
  var apiResult = oneRosterApi("users", undefined, { email: user.email });
  Logger.log(apiResult.users.length);
  if (apiResult.users.length > 0) {
    user.authenticated = true;
    user.inDb = true;
    return user;
  }
  Logger.log("User not in ClassLink");
  var users = ss.getSheetByName("users");
  var teachers = getTeachers(users);
  var teacherEmails = getTeacherEmails(teachers);
  if (teacherEmails.indexOf(activeUserEmail) >= 0) {
    Logger.log("user found in Google Sheet");
    user.authenticated = true;
    return user;
  } else {
    Logger.log(
      activeUserEmail + " user NOT found in Google Sheet...not a teacher"
    );
    user.authenticated = false;
    return user;
  }
}

function getTeachers(sheet) {
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();
  var teachers = [];
  for (i = 1; i < values.length; i++) {
    if (values[i][5] == "teacher") {
      teachers.push(values[i]);
    }
  }
  return teachers;
}

function getTeacherEmails(arr) {
  let emails = [];
  for (i = 0; i < arr.length; i++) {
    emails.push(arr[i][6]);
  }
  return emails;
}

function _readData(sheetObject, id, properties, filters) {
  if (typeof properties == "undefined" && filters) {
    properties = _getHeaderRow(sheetObject, filters);
    if (properties) {
      properties = properties.map(function (p) {
        return p.replace(/\s+/g, "_");
      });
    } else {
      Logger.log("problems getting header rows");
    }
  } else if (typeof properties == "undefined") {
    properties = _getHeaderRow(sheetObject);

    if (properties) {
      properties = properties.map(function (p) {
        return p.replace(/\s+/g, "_");
      });
    } else {
      Logger.log("problems getting header rows");
    }
  }
  if (properties) {
    var rows = _getDataRows(sheetObject),
      data = [];
    if (filters) {
      var filterKeys = Object.keys(filters);
      var filterValues = Object.values(filters);
      var filterIndexes = [];
      for (var k = 0; k < filterKeys.length; k++) {
        filterIndexes.push(properties.indexOf(filterKeys[k]));
      }
      for (var r = 0, l = rows.length; r < l; r++) {
        var row = rows[r],
          record = {};
        for (var p in properties) {
          record[properties[p]] = row[p];
        }
        var recordValues = Object.values(record);
        if (checkDataFilters(filterValues, recordValues, filterIndexes)) {
          data.push(record);
        } else {
          //Error
        }
      }
    } else {
      for (var r = 0, l = rows.length; r < l; r++) {
        var row = rows[r],
          record = {};
        for (var p in properties) {
          record[properties[p]] = row[p];
        }
        data.push(record);
      }
    }
  }
  return data;
}

function _getDataRows(sheetObject) {
  var sh = sheetObject;
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow > 1) {
    return sh
      .getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn())
      .getValues();
  } else {
    return sh.getRange(2, 1, 1, lastCol).getValues();
  }
}

function _getHeaderRow(sheetObject, filters) {
  var sh = sheetObject;
  var headerArray = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (filters) {
    var filterArray = Object.keys(filters);
    if (checkFilters(filterArray, headerArray)) {
      return headerArray;
    } else {
      Logger.log("problem getting header row");
      return false;
    }
  } else {
    return headerArray;
  }
}

function checkFilters(filterArray, headerArray) {
  return filterArray.every((i) => headerArray.includes(i));
}

function checkDataFilters(filterValues, recordValues, filterIndexes) {
  let results = [];
  for (i = 0; i < filterIndexes.length; i++) {
    results.push(
      recordValues[filterIndexes[i]].toString() == filterValues[i].toString()
    );
  }
  let result = results.every((e) => e == true);
  return result;
}

function getOneRosterData(sheetName, filters) {
  var sheetObject = ss.getSheetByName(sheetName);
  var data = {};
  if (filters) {
    data.records = _readData(sheetObject, undefined, undefined, filters);
    return data;
  } else {
    data.records = _readData(sheetObject);
    return data;
  }
}

function getNotesData(sheetName, filters) {
  var sheetObject = db.getSheetByName(sheetName);
  var data = {};
  if (filters) {
    data.records = _readData(sheetObject, undefined, undefined, filters);
    data.records.reverse();
    return JSON.stringify(data.records);
  } else {
    data.records = _readData(sheetObject);
    return data;
  }
}

function saveNote(arr) {
  var uuid = Utilities.getUuid();
  arr[0].unshift(uuid);
  var noteSheet = db.getSheetByName("notes");
  var lastRow = noteSheet.getLastRow();
  var nextRow = lastRow + 1;
  var range = noteSheet.getRange(nextRow, 1, 1, arr[0].length);
  range.setValues(arr);
  return true;
}

function deleteNote(uuid, user) {
  let sheets = db.getSheets();
  let noteSheet = sheets[0];
  var dataRange = noteSheet.getDataRange();
  var data = dataRange.getValues();
  var trashSheet = sheets[1];
  var lastRow = trashSheet.getLastRow();
  var nextRow = lastRow + 1;
  // find the note in the data array
  var note = [];
  for (r = 1; r < data.length; r++) {
    if (data[r][0] == uuid) {
      note.push(data[r]);
      note[0].push(user);
      var trashRange = trashSheet.getRange(nextRow, 1, 1, note[0].length);
      trashRange.setValues(note);
      noteSheet.deleteRow(r + 1);
    }
  }
}
