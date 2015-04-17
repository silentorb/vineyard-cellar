/// <reference path="../vineyard/vineyard.d.ts"/>
/// <reference path="../vineyard-lawn/lawn.d.ts"/>

import Vineyard = require('vineyard')
var Lawn = require('vineyard-lawn')
var uuid = require('node-uuid')
var when = require('when')

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
    if (this.config.paths.cache && this.config.templates) {
      lawn.listen_user_http('/vineyard/cellar/:template/:guid.:ext', (req, res, user)=> this.file_download(req, res, user), 'get')
    }
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
    var filepath = (this.config.paths.files) + '/' + filename
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
    var template_name = req.params.template
    var guid = req.params.guid
    var ext = req.params.ext

    var template = this.config.templates[template_name]
    if (!template)
      throw new HttpError('Invalid template: ' + template_name + '.', 404)

    if (!guid.match(/[\w\-]+/) || !ext.match(/\w+/))
      throw new HttpError('Invalid File Name', 400)

    var path = require('path')
    var filepath = path.join(this.vineyard.root_path, this.config.paths.cache, template_name, guid + '.' + ext)
    console.log(filepath)
    return Cellar.file_exists(filepath)
      .then((exists)=> {
        if (exists) {
          res.sendFile(filepath)
          return
        }

        var source_file = path.join(this.vineyard.root_path, this.config.paths.files, guid + '.' + ext)
        return Cellar.file_exists(source_file)
          .then((exists)=> {
            if (!exists)
              throw new Lawn.HttpError('File Not Found', 404)

            return this.resize(template, source_file, filepath)
              .then(()=> {
                res.sendFile(filepath)
              })
          })
      })
  }

  resize(template, source, dest):Promise {
    var gm = require('gm')
    var new_width = template.width
    var new_height = template.height
    var def = new when.defer()

    gm(source)
      .options({imageMagick: true})
      .size(source, (error, original)=> {
        var desired_aspect = new_width / new_height
        var orig_aspect = original.width / original.height
        var trim

        var operation = gm(source)
          .options({imageMagick: true})

        if (desired_aspect > orig_aspect) {
          trim = original.height - (original.width / desired_aspect)
          operation = operation.crop(original.width, original.height - trim, 0, trim / 2)
        }
        else {
          trim = original.width - (original.height * desired_aspect)
          operation = operation.crop(original.width - trim, original.height, trim / 2, 0)
        }

        operation.resize(new_width, new_height)
          .write(dest, function (err) {
            if (err) {
              console.log('error writing file ' + dest, err)
              def.reject(err)
            }
            else {
              def.resolve()
            }
          })
      })
    return def.promise
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