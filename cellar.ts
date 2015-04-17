/// <reference path="../vineyard/vineyard.d.ts"/>
/// <reference path="../vineyard-lawn/lawn.d.ts"/>

import Vineyard = require('vineyard')
var uuid = require('node-uuid')

class Cellar extends Vineyard.Bulb {

  grow() {
    var lawn = this.vineyard.bulbs.lawn
    this.listen(lawn, 'http.start', (app)=> this.initialize_services(app))
  }

  initialize_services(app) {
    var multer = require('multer')
    app.use(multer({dest: this.config.paths.temp}))
    var lawn = this.vineyard.bulbs.lawn
    lawn.listen_user_http('/vineyard/upload', (req, res, user)=> this.upload(req, res, user))
    //this.lawn.listen_user_http('/file/:guid.:ext', (req, res, user)=> this.file_download(req, res, user), 'get')
  }

  upload(req, res, user) {
    var body = req.body
    console.log('files', req.files)
    console.log('req.body', body)
    var guid, file = req.files.file;
    if (body.info) {
      var info = JSON.parse(body.info)
      if (info.guid) {
        if (!info.guid.match(/[\w\-]+/))
          throw new HttpError('Invalid guid: ' + info.guid + '.', 400)

        guid = info.guid
      }
    }

    guid = guid || uuid.v1()

    var path = require('path')
    var ext = path.extname(file.originalname) || ''
    var filename = guid + ext
    var filepath = (this.config.paths.file) + '/' + filename
    var fs = require('fs')
    fs.rename(file.path, filepath);

    // !!! Add check if file already exists
    return this.ground.update_object('file', {
      guid: guid,
      name: filename,
      path: file.path,
      size: file.size,
      extension: ext.substring(1),
      status: 1
    }, user)
      .then((object)=> {
        res.send({file: object})
        this.invoke('file.uploaded', object)
      })
  }

  file_download(req, res, user) {
    var guid = req.params.guid;
    var ext = req.params.ext;
    if (!guid.match(/[\w\-]+/) || !ext.match(/\w+/))
      throw new HttpError('Invalid File Name', 400)

    var path = require('path')
    var filepath = path.join(this.vineyard.root_path, this.config.paths.file || 'files', guid + '.' + ext)
    console.log(filepath)
    return Cellar.file_exists(filepath)
      .then((exists)=> {
        if (!exists)
          throw new HttpError('File Not Found', 404)
//          throw new Error('File Not Found')

        var query = this.ground.create_query('file')
        query.add_key_filter(req.params.guid)
        var fortress = this.vineyard.bulbs.fortress

        fortress.query_access(user, query)
          .then((result)=> {
            if (result.access)
              res.sendfile(filepath)
            else
              throw new Authorization_Error('Access Denied', user)
          })
      })
  }

  private static file_exists(filepath:string):Promise {
    var fs = require('fs'), def = when.defer()
    fs.exists(filepath, (exists)=> {
      def.resolve(exists)
    })
    return def.promise
  }

}

module.exports = Cellar